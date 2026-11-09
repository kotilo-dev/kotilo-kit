import { afterEach, describe, expect, it } from 'vitest';
import { createContext, createRegistry, isToolError, loadPlugins, runTool, t, type PluginSet } from '../src/index.js';

const SLUG = `import { defineTool, fail } from '@kotilo/kit-core';

interface Opts { sep: string }

export default defineTool<Opts>({
  id: 'slug',
  category: 'text',
  name: { en: 'Slug', tr: 'Slug üret' },
  description: { en: 'Text to URL slug', tr: 'Metni URL dostu slug yapar' },
  options: [{ key: 'sep', type: 'segmented', values: ['-', '_'], default: '-' }],
  messages: {
    en: { 'tool.slug.opt.sep': 'Separator', 'error.slug.empty': 'Nothing to slug' },
    tr: { 'tool.slug.opt.sep': 'Ayraç', 'error.slug.empty': 'Slug yapılacak metin yok' },
  },
  detect: (input: string) => (/^[A-Za-z ]+$/.test(input) ? 0.4 : 0),
  run(input, opts, ctx) {
    const s = input.trim().toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
    if (!s) fail('error.slug.empty');
    return { output: s.split(/[^a-z0-9]+/).filter(Boolean).join(opts.sep), meta: { year: ctx.now.getUTCFullYear() } };
  },
});
`;

const tool = (body: string) => `import { defineTool } from '@kotilo/kit-core';
export default defineTool({ id: 'x', category: 'text', name: 'X', description: 'x', run: ${body} });
`;

let sets: PluginSet[] = [];
const load = async (files: Record<string, string>, taken?: (id: string) => boolean) => {
  const set = await loadPlugins(
    Object.entries(files).map(([name, source]) => ({ file: `/cfg/tools/${name}`, source })),
    taken ? { taken } : {},
  );
  sets.push(set);
  return set;
};
afterEach(() => {
  sets.forEach((s) => s.dispose());
  sets = [];
});

describe('loadPlugins', () => {
  it('loads a TypeScript plugin and runs it in the sandbox', async () => {
    const { tools, plugins } = await load({ 'slug.ts': SLUG });
    expect(plugins[0]!.error).toBeUndefined();
    expect(plugins[0]!.display).toBe('tools/slug.ts');
    const slug = tools[0]!;
    expect(slug.name.tr).toBe('Slug üret');
    expect(slug.options[0]!.key).toBe('sep');
    const now = new Date('2026-11-09T00:00:00Z');
    const r = runTool(slug, 'Işık Ağacı Çiçek', { sep: '_' }, { locale: 'tr', now });
    expect(r.output).toBe('isik_agaci_cicek');
    expect(r.meta).toEqual({ year: 2026 });
  });

  it('plugin strings are scoped to its id; fail() becomes a localized ToolError', async () => {
    const { tools } = await load({ 'slug.ts': SLUG });
    expect(t('tr', 'tool.slug.opt.sep')).toBe('Ayraç');
    expect(t('en', 'tool.slug.opt.sep')).toBe('Separator');
    try {
      runTool(tools[0]!, '   ', {}, { locale: 'tr' });
      expect.unreachable();
    } catch (e) {
      expect(isToolError(e) && t('tr', e.code)).toBe('Slug yapılacak metin yok');
    }
  });

  it('detect runs in the sandbox and joins the registry', async () => {
    const { tools } = await load({ 'slug.ts': SLUG });
    expect(tools[0]!.detect!('Hello World')).toBe(0.4);
    expect(tools[0]!.detect!('{}')).toBe(0);
    const reg = createRegistry(tools);
    expect(reg.get('slug')).toBe(tools[0]);
  });

  it('reports syntax errors with line:column', async () => {
    const { plugins, tools } = await load({ 'bad.ts': `import { defineTool } from '@kotilo/kit-core';\nconst a = ;\n` });
    expect(tools).toHaveLength(0);
    expect(plugins[0]!.error).toMatchObject({ code: 'error.plugin.syntax', loc: '2:11' });
  });

  it('a missing field names the field and the defineTool line', async () => {
    const src = `import { defineTool } from '@kotilo/kit-core';\n\nexport default defineTool({ category: 'text', name: 'a', description: 'b', run: (s) => ({ output: s }) });\n`;
    const { plugins } = await load({ 'ip-calc.ts': src });
    expect(plugins[0]!.error).toMatchObject({ code: 'error.plugin.missingField', params: { field: 'id' } });
    expect(plugins[0]!.error!.loc).toMatch(/^3:\d+$/);
    expect(t('tr', plugins[0]!.error!.code, plugins[0]!.error!.params)).toBe('defineTool çağrısında “id” eksik');
  });

  it('only defineTool/fail from @kotilo/kit-core can be imported', async () => {
    const { plugins } = await load({
      'net.ts': `import fs from 'node:fs';\nfs.readFileSync('x');\n${tool('(s) => ({ output: s })')}`,
      'other.ts': `import { createRegistry } from '@kotilo/kit-core';\ncreateRegistry([]);\n${tool('(s) => ({ output: s })')}`,
    });
    expect(plugins[0]!.error).toMatchObject({ code: 'error.plugin.import', params: { name: 'node:fs' } });
    expect(plugins[1]!.error!.code).toBe('error.plugin.load');
  });

  it('the sandbox has no network, fs or DOM globals', async () => {
    const probe = tool(`() => ({ output: [typeof fetch, typeof XMLHttpRequest, typeof document, typeof process, typeof std, typeof os, typeof WebAssembly].join(',') })`);
    const { tools } = await load({ 'probe.ts': probe });
    expect(runTool(tools[0]!, '').output).toBe('undefined,undefined,undefined,undefined,undefined,undefined,undefined');
  });

  it('stops a run that exceeds the CPU budget', async () => {
    const { tools } = await load({ 'loop.ts': tool('() => { for (;;) {} }') });
    expect(() => runTool(tools[0]!, 'x')).toThrow(expect.objectContaining({ code: 'error.plugin.timeout' }) as Error);
    // and stays usable afterwards
    expect(() => runTool(tools[0]!, 'x')).toThrow(expect.objectContaining({ code: 'error.plugin.timeout' }) as Error);
  });

  it('stops a module whose top level never finishes', async () => {
    const { plugins } = await load({ 'hang.ts': `while (true) {}\n${tool('(s) => ({ output: s })')}` });
    expect(plugins[0]!.error!.code).toBe('error.plugin.timeout');
  });

  it('caps memory', async () => {
    const { tools } = await load({ 'mem.ts': tool("() => ({ output: 'x'.repeat(64 * 1024 * 1024) })") });
    expect(() => runTool(tools[0]!, 'x')).toThrow(expect.objectContaining({ code: expect.stringMatching(/^error\.plugin\.memory$/) }) as Error);
  });

  it('unexpected exceptions become error.plugin.crashed with the line', async () => {
    const { tools } = await load({ 'crash.ts': `import { defineTool } from '@kotilo/kit-core';\nexport default defineTool({ id: 'x', category: 'text', name: 'X', description: 'x',\n  run: () => null.boom });\n` });
    try {
      runTool(tools[0]!, 'x');
      expect.unreachable();
    } catch (e) {
      expect(isToolError(e) && e.code).toBe('error.plugin.crashed');
      expect(String(isToolError(e) && e.params.detail)).toMatch(/^3:\d+ TypeError/);
    }
  });

  it('rejects taken ids, duplicate ids and multiple tools per file', async () => {
    const two = `import { defineTool } from '@kotilo/kit-core';\ndefineTool({ id: 'a' });\ndefineTool({ id: 'b' });\n`;
    const { plugins } = await load({ 'a.ts': SLUG, 'b.ts': SLUG, 'c.ts': two, 'd.ts': tool('(s) => ({ output: s })') }, (id) => id === 'x');
    expect(plugins.map((p) => p.error?.code)).toEqual([undefined, 'error.plugin.idTaken', 'error.plugin.manyTools', 'error.plugin.idTaken']);
  });

  it('validates option specs and message keys', async () => {
    const badOpt = `import { defineTool } from '@kotilo/kit-core';\nexport default defineTool({ id: 'y', category: 'text', name: 'Y', description: 'y', options: [{ key: 'k', type: 'slider', default: 1 }], run: (s) => ({ output: s }) });\n`;
    const badMsg = `import { defineTool } from '@kotilo/kit-core';\nexport default defineTool({ id: 'z', category: 'text', name: 'Z', description: 'z', messages: { en: { 'ui.copy': 'pwned' } }, run: (s) => ({ output: s }) });\n`;
    const { plugins } = await load({ 'y.ts': badOpt, 'z.ts': badMsg });
    expect(plugins.map((p) => p.error?.code)).toEqual(['error.plugin.invalid', 'error.plugin.invalid']);
    expect(t('en', 'ui.copy')).not.toBe('pwned');
  });

  it('passes file bytes in and binary results out; ctx.random and ctx.t work', async () => {
    const src = `import { defineTool } from '@kotilo/kit-core';
export default defineTool({ id: 'bin', category: 'encoding', name: 'Bin', description: 'b', accepts: ['text', 'file'],
  run: (input, _o, ctx) => ({ output: ctx.t('ui.copy') + ' ' + ctx.random(2).length, bytes: new Uint8Array([...(ctx.bytes ?? []), 255]) }) });
`;
    const { tools } = await load({ 'bin.ts': src });
    const ctx = createContext({ locale: 'tr', bytes: new Uint8Array([1, 2]), random: (n) => new Uint8Array(n).fill(7) });
    const r = runTool(tools[0]!, 'x', {}, ctx);
    expect(r.output).toBe(`${t('tr', 'ui.copy')} 2`);
    expect([...r.bytes!]).toEqual([1, 2, 255]);
  });

  it('no files: no wasm loaded, empty set', async () => {
    const set = await loadPlugins([]);
    expect(set.tools).toEqual([]);
  });
});
