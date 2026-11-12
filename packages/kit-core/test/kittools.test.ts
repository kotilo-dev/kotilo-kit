import { ed25519 } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';
import {
  KIT_TOOLS_PUBLIC_KEY,
  defaultConfig,
  fetchKitTool,
  forgetKitTool,
  kitToolVersion,
  kitToolsDownloads,
  parseConfig,
  recordKitTool,
  sha256Hex,
  stringifyConfig,
  verifyKitToolsIndex,
  type KitToolsFetch,
} from '../src/index.js';

const enc = (s: string) => new TextEncoder().encode(s);
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

const { secretKey, publicKey } = ed25519.keygen(new Uint8Array(32).fill(7));
const PUB = b64(publicKey);
const SLUG = `import { defineTool } from '@kotilo/kit-core';\nexport default defineTool({ id: 'slug', category: 'text', name: 'Slug', description: 's', run: (i) => ({ output: i }) });\n`;

function site(over: { tools?: unknown[]; files?: Record<string, string>; sig?: string; index?: string } = {}) {
  const tools = over.tools ?? [{ id: 'slug', version: '1.2.0', file: 'tools/slug.ts', sha256: sha256Hex(SLUG), bytes: SLUG.length, summary: { en: 'Slug', tr: 'Slug' } }];
  const index = over.index ?? JSON.stringify({ schema: 1, tools }, null, 2) + '\n';
  const files: Record<string, string> = {
    'index.json': index,
    'index.json.sig': over.sig ?? b64(ed25519.sign(enc(index), secretKey)) + '\n',
    'tools/slug.ts': SLUG,
    ...over.files,
  };
  const requested: string[] = [];
  const fetch: KitToolsFetch = async (path) => {
    requested.push(path);
    if (!(path in files)) throw new Error(`HTTP 404 ${path}`);
    return enc(files[path]!);
  };
  return { fetch, requested };
}

describe('kit add — fetchKitTool', () => {
  it('installs a tool whose index signature and sha256 check out', async () => {
    const s = site();
    const r = await fetchKitTool('slug', s.fetch, PUB);
    expect(r).toEqual({ id: 'slug', version: '1.2.0', sha256: sha256Hex(SLUG), source: SLUG });
    expect(s.requested.sort()).toEqual(['index.json', 'index.json.sig', 'tools/slug.ts']);
  });

  it('rejects a tampered index (signature no longer matches)', async () => {
    const good = site();
    const index = new TextDecoder().decode(await good.fetch('index.json')).replace('1.2.0', '9.9.9');
    const sig = new TextDecoder().decode(await good.fetch('index.json.sig'));
    await expect(fetchKitTool('slug', site({ index, sig }).fetch, PUB)).rejects.toMatchObject({ code: 'error.kitAdd.signature' });
  });

  it('rejects an index signed by another key — including the real one for this test key', async () => {
    await expect(fetchKitTool('slug', site().fetch, KIT_TOOLS_PUBLIC_KEY)).rejects.toMatchObject({ code: 'error.kitAdd.signature' });
    await expect(fetchKitTool('slug', site({ sig: 'not base64!' }).fetch, PUB)).rejects.toMatchObject({ code: 'error.kitAdd.signature' });
  });

  it('rejects a tool file that differs from the pinned sha256 and never downloads it twice', async () => {
    const s = site({ files: { 'tools/slug.ts': SLUG + '// evil\n' } });
    await expect(fetchKitTool('slug', s.fetch, PUB)).rejects.toMatchObject({ code: 'error.kitAdd.hash', params: { file: 'tools/slug.ts' } });
  });

  it('unknown names, bad names and network failures', async () => {
    await expect(fetchKitTool('nope', site().fetch, PUB)).rejects.toMatchObject({ code: 'error.kitAdd.notFound', params: { name: 'nope' } });
    const s = site();
    await expect(fetchKitTool('../etc', s.fetch, PUB)).rejects.toMatchObject({ code: 'error.kitAdd.name' });
    await expect(fetchKitTool('Slug', s.fetch, PUB)).rejects.toMatchObject({ code: 'error.kitAdd.name' });
    expect(s.requested).toEqual([]); // nothing goes out for an invalid name
    const offline: KitToolsFetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(fetchKitTool('slug', offline, PUB)).rejects.toMatchObject({ code: 'error.kitAdd.network', params: { detail: 'Failed to fetch' } });
  });

  it('ignores index entries whose file path does not match the id', async () => {
    const tools = [{ id: 'slug', version: '1.0.0', file: '../../evil.ts', sha256: sha256Hex(SLUG), summary: { en: '', tr: '' } }];
    await expect(fetchKitTool('slug', site({ tools }).fetch, PUB)).rejects.toMatchObject({ code: 'error.kitAdd.notFound' });
  });

  it('rejects an index that is signed but malformed', async () => {
    const index = '{"schema":2,"tools":[]}';
    expect(() => verifyKitToolsIndex(enc(index), enc(b64(ed25519.sign(enc(index), secretKey))), PUB)).toThrow(expect.objectContaining({ code: 'error.kitAdd.index' }));
  });

  it('lists the files it will download for the consent text', () => {
    expect(kitToolsDownloads('slug')).toEqual(['index.json', 'index.json.sig', 'tools/slug.ts']);
  });
});

describe('kit add — install records', () => {
  it('records version + sha256 in config.toml and round-trips', () => {
    const c = recordKitTool(defaultConfig(), { id: 'slug', version: '1.2.0', sha256: sha256Hex(SLUG) });
    const back = parseConfig(stringifyConfig(c));
    expect(back.plugins.installed).toEqual({ slug: { version: '1.2.0', sha256: sha256Hex(SLUG) } });
    expect(stringifyConfig(c)).toContain('[plugins.installed.slug]');
    expect(forgetKitTool(back, 'slug').plugins.installed).toEqual({});
  });

  it('the kit-tools badge only vouches for the exact signed bytes', () => {
    const c = recordKitTool(defaultConfig(), { id: 'slug', version: '1.2.0', sha256: sha256Hex(SLUG) });
    expect(kitToolVersion(c, 'slug', SLUG)).toBe('1.2.0');
    expect(kitToolVersion(c, 'slug', SLUG + ' ')).toBeUndefined();
    expect(kitToolVersion(c, 'other', SLUG)).toBeUndefined();
  });

  it('drops malformed installed entries', () => {
    const c = parseConfig('[plugins.installed.slug]\nversion = "1.0.0"\nsha256 = "nothex"\n[plugins.installed.ok]\nversion = "1.0.0"\nsha256 = "' + 'a'.repeat(64) + '"\n');
    expect(Object.keys(c.plugins.installed)).toEqual(['ok']);
  });
});
