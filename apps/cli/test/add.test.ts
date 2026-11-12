import { ed25519 } from '@noble/curves/ed25519.js';
import { defaultConfig, recordKitTool, sha256Hex, type KitConfig } from '@kotilo/kit-core';
import { describe, expect, it } from 'vitest';
import { runAdd, type AddIO } from '../src/add.js';

const enc = (s: string) => new TextEncoder().encode(s);
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const { secretKey, publicKey } = ed25519.keygen(new Uint8Array(32).fill(3));

const V1 = `import { defineTool } from '@kotilo/kit-core';\nexport default defineTool({ id: 'slug', category: 'text', name: 'Slug', description: 's', run: (i) => ({ output: i }) });\n`;
const V2 = V1.replace("'s'", "'slug v2'");

function harness(opts: { source?: string; version?: string; interactive?: boolean; answer?: string; tools?: Record<string, string>; config?: KitConfig } = {}) {
  const source = opts.source ?? V1;
  const index = JSON.stringify({ schema: 1, tools: [{ id: 'slug', version: opts.version ?? '1.0.0', file: 'tools/slug.ts', sha256: sha256Hex(source), summary: { en: '', tr: '' } }] });
  const files: Record<string, string> = { 'index.json': index, 'index.json.sig': b64(ed25519.sign(enc(index), secretKey)), 'tools/slug.ts': source };
  const state = { tools: { ...opts.tools }, config: opts.config ?? defaultConfig(), out: '', err: '', requests: [] as string[], asked: 0 };
  const io: AddIO = {
    locale: 'en',
    interactive: opts.interactive ?? true,
    ask: async () => {
      state.asked++;
      return opts.answer ?? 'y';
    },
    fetch: async (path) => {
      state.requests.push(path);
      return enc(files[path]!);
    },
    publicKey: b64(publicKey),
    readTool: (id) => state.tools[id],
    writeTool: (id, s) => void (state.tools[id] = s),
    readConfig: () => state.config,
    writeConfig: (c) => void (state.config = c),
    toolPath: (id) => `/cfg/tools/${id}.ts`,
    out: (t) => void (state.out += t),
    err: (t) => void (state.err += t),
  };
  return { io, state };
}

describe('kotilo kit add', () => {
  it('shows what goes over the network, asks, installs and records the version', async () => {
    const { io, state } = harness();
    expect(await runAdd('slug', { yes: false, force: false }, io)).toBe(0);
    expect(state.asked).toBe(1);
    expect(state.err).toContain('kotilo.dev/kit-tools');
    expect(state.err).toContain('index.json · index.json.sig · tools/slug.ts');
    expect(state.tools.slug).toBe(V1);
    expect(state.config.plugins.installed.slug).toEqual({ version: '1.0.0', sha256: sha256Hex(V1) });
    expect(state.out).toBe('Installed slug 1.0.0 → /cfg/tools/slug.ts\n');
  });

  it('anything but yes cancels before a single request', async () => {
    const { io, state } = harness({ answer: '' });
    expect(await runAdd('slug', { yes: false, force: false }, io)).toBe(1);
    expect(state.requests).toEqual([]);
    expect(state.err).toContain('Nothing was downloaded');
  });

  it('accepts "evet" in Turkish', async () => {
    const { io, state } = harness({ answer: 'EVET' });
    io.locale = 'tr';
    expect(await runAdd('slug', { yes: false, force: false }, io)).toBe(0);
    expect(state.tools.slug).toBe(V1);
  });

  it('without a terminal it needs --yes for this one call (no remembered approval)', async () => {
    const h = harness({ interactive: false });
    expect(await runAdd('slug', { yes: false, force: false }, h.io)).toBe(2);
    expect(h.state.requests).toEqual([]);
    expect(h.state.err).toContain('--yes');
    expect(await runAdd('slug', { yes: true, force: false }, h.io)).toBe(0);
    expect(h.state.asked).toBe(0);
  });

  it('updates a kit-tools install and reports the version change', async () => {
    const { io, state } = harness({ source: V2, version: '1.1.0', tools: { slug: V1 }, config: recordKitTool(defaultConfig(), { id: 'slug', version: '1.0.0', sha256: sha256Hex(V1) }) });
    expect(await runAdd('slug', { yes: true, force: false }, io)).toBe(0);
    expect(state.tools.slug).toBe(V2);
    expect(state.out).toContain('Updated slug 1.0.0 → 1.1.0');
  });

  it('says so when the same version is already installed', async () => {
    const { io, state } = harness({ tools: { slug: V1 }, config: recordKitTool(defaultConfig(), { id: 'slug', version: '1.0.0', sha256: sha256Hex(V1) }) });
    expect(await runAdd('slug', { yes: true, force: false }, io)).toBe(0);
    expect(state.out).toBe('slug 1.0.0 is already installed.\n');
  });

  it('never overwrites a local file unless --force', async () => {
    const mine = '// my own slug\n';
    const h = harness({ tools: { slug: mine } });
    expect(await runAdd('slug', { yes: true, force: false }, h.io)).toBe(1);
    expect(h.state.tools.slug).toBe(mine);
    expect(h.state.err).toContain('--force');
    expect(await runAdd('slug', { yes: true, force: true }, h.io)).toBe(0);
    expect(h.state.tools.slug).toBe(V1);
  });

  it('a bad signature installs nothing', async () => {
    const { io, state } = harness();
    io.publicKey = b64(ed25519.getPublicKey(new Uint8Array(32).fill(9)));
    expect(await runAdd('slug', { yes: true, force: false }, io)).toBe(1);
    expect(state.tools).toEqual({});
    expect(state.config.plugins.installed).toEqual({});
    expect(state.err).toContain('signature did not verify');
  });
});
