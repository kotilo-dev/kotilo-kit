import { describe, expect, it } from 'vitest';
import {
  ToolError,
  createContext,
  createRegistry,
  defineTool,
  errorMessage,
  fail,
  parsePipeline,
  pipelineTool,
  registryWithPipelines,
  runPipeline,
  runTool,
  stringifyPipeline,
  validatePipeline,
  type PipelineDef,
} from '../src/index.js';

const upper = defineTool<{ lang: 'tr' | 'en' }>({
  id: 'upper',
  category: 'text',
  name: { en: 'Upper', tr: 'Büyük harf' },
  description: { en: 'Upper-cases', tr: 'Büyük harfe çevirir' },
  options: [{ key: 'lang', type: 'segmented', values: ['tr', 'en'], default: 'tr' }],
  run: (input, opts) => ({ output: input.toLocaleUpperCase(opts.lang === 'tr' ? 'tr-TR' : 'en-US') }),
});

const rev = defineTool({
  id: 'rev',
  category: 'text',
  name: { en: 'Reverse', tr: 'Ters çevir' },
  description: { en: 'Reverses', tr: 'Ters çevirir' },
  run: (input) => {
    if (!input) fail('error.json.empty');
    return { output: [...input].reverse().join('') };
  },
});

const table = defineTool({
  id: 'table',
  category: 'web',
  name: { en: 'Table', tr: 'Tablo' },
  description: { en: 'Splits words', tr: 'Kelimeleri böler' },
  layout: 'table',
  run: (input) => ({ output: { columns: ['i', 'word'], rows: input.split(' ').map((w, i) => [String(i), w]) } }),
});

const bytesOut = defineTool({
  id: 'bytes-out',
  category: 'encoding',
  name: { en: 'Bytes out', tr: 'Bayt çıkar' },
  description: { en: 'Emits bytes', tr: 'Bayt üretir' },
  run: () => ({ output: '(2 bytes)', bytes: new Uint8Array([104, 105]) }),
});

const bytesIn = defineTool({
  id: 'bytes-in',
  category: 'encoding',
  name: { en: 'Bytes in', tr: 'Bayt al' },
  description: { en: 'Counts bytes', tr: 'Bayt sayar' },
  accepts: ['text', 'file'],
  run: (input, _o, ctx) => ({ output: `${ctx.bytes ? ctx.bytes.length : 'no'} bytes, text=${input}` }),
});

const registry = createRegistry([upper, rev, table, bytesOut, bytesIn]);
const ctx = (locale: 'en' | 'tr' = 'en') => createContext({ locale, now: new Date(0) });

const TOML = `
name = "shout"
palette = false

[[steps]]
tool = "upper"
opts = { lang = "tr" }

[[steps]]
tool = "rev"
`;

describe('parsePipeline', () => {
  it('reads name, palette and steps with opts', () => {
    expect(parsePipeline(TOML)).toEqual({
      name: 'shout',
      palette: false,
      steps: [
        { tool: 'upper', opts: { lang: 'tr' } },
        { tool: 'rev', opts: {} },
      ],
    });
  });

  it('palette defaults to true; name falls back to the file stem', () => {
    const def = parsePipeline('[[steps]]\ntool = "rev"\n', 'from-file');
    expect(def.name).toBe('from-file');
    expect(def.palette).toBe(true);
  });

  it('round-trips through stringifyPipeline', () => {
    const def = parsePipeline(TOML);
    expect(parsePipeline(stringifyPipeline(def))).toEqual(def);
  });

  it.each([
    ['name = "x"\n[[steps', 'error.pipeline.parse'],
    ['name = "Büyük"\n[[steps]]\ntool = "rev"', 'error.pipeline.badName'],
    ['name = "x"', 'error.pipeline.noSteps'],
    ['name = "x"\n[[steps]]\nopts = {}', 'error.pipeline.badStep'],
    ['name = "x"\n[[steps]]\ntool = "rev"\nopts = { a = [1] }', 'error.pipeline.badStep'],
  ])('rejects %j with %s', (source, code) => {
    expect(() => parsePipeline(source)).toThrow(expect.objectContaining({ code }));
  });
});

describe('validatePipeline', () => {
  it('reports unknown tools and options, step-numbered', () => {
    const def: PipelineDef = {
      name: 'p',
      palette: true,
      steps: [
        { tool: 'upper', opts: { lang: 'en', nope: 1 } },
        { tool: 'gzip', opts: {} },
      ],
    };
    expect(validatePipeline(def, registry).map((i) => [i.step, i.code])).toEqual([
      [1, 'error.pipeline.unknownOption'],
      [2, 'error.pipeline.unknownTool'],
    ]);
  });

  it('a pipeline may not take a tool id', () => {
    const def: PipelineDef = { name: 'rev', palette: true, steps: [{ tool: 'upper', opts: {} }] };
    expect(validatePipeline(def, registry)[0]?.code).toBe('error.pipeline.idTaken');
  });
});

describe('runPipeline', () => {
  it("feeds each step's output to the next and keeps intermediate results", () => {
    let tick = 0;
    const run = runPipeline(parsePipeline(TOML), registry, 'ılık', ctx(), () => (tick += 2));
    expect(run.steps.map((s) => s.result.output)).toEqual(['ILIK', 'KILI']);
    expect(run.steps.map((s) => s.ms)).toEqual([2, 2]);
    expect(run.result.output).toBe('KILI');
  });

  it('turns a table into TSV for the next step', () => {
    const def: PipelineDef = { name: 't', palette: true, steps: [{ tool: 'table', opts: {} }, { tool: 'upper', opts: { lang: 'en' } }] };
    expect(runPipeline(def, registry, 'a b', ctx()).result.output).toBe('I\tWORD\n0\tA\n1\tB');
  });

  it('passes bytes on to steps that accept files, not to text-only steps', () => {
    const def: PipelineDef = { name: 'b', palette: true, steps: [{ tool: 'bytes-out', opts: {} }, { tool: 'bytes-in', opts: {} }] };
    expect(runPipeline(def, registry, '', ctx()).result.output).toBe('2 bytes, text=(2 bytes)');
  });

  it('a failing step names the step and keeps the tool message, localized', () => {
    const def: PipelineDef = { name: 'f', palette: true, steps: [{ tool: 'upper', opts: {} }, { tool: 'rev', opts: {} }] };
    try {
      runPipeline(def, registry, '', ctx('tr'));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect(errorMessage('tr', e)).toBe('2. adım (Ters çevir): Giriş boş');
      expect(errorMessage('en', new ToolError((e as ToolError).code, (e as ToolError).params))).toMatch(/^Step 2 \(Ters çevir\): /);
    }
  });

  it('refuses to run an invalid pipeline', () => {
    const def: PipelineDef = { name: 'x', palette: true, steps: [{ tool: 'gzip', opts: {} }] };
    expect(() => runPipeline(def, registry, 'a', ctx())).toThrow(expect.objectContaining({ code: 'error.pipeline.unknownTool' }));
  });
});

describe('pipelineTool and registryWithPipelines', () => {
  it('wraps a pipeline as a tool with a chain description', () => {
    const tool = pipelineTool(parsePipeline(TOML), registry);
    expect(tool.category).toBe('pipeline');
    expect(tool.description.tr).toBe('Büyük harf → Ters çevir');
    expect(runTool(tool, 'iş', {}, ctx()).output).toBe('Şİ');
    expect(runTool(tool, 'iş', {}, ctx()).meta?.steps).toBe(2);
  });

  it('registers valid pipelines and reports the rest with their file', () => {
    const { registry: r, pipelines } = registryWithPipelines(
      [upper, rev],
      [
        { file: '/cfg/pipelines/shout.toml', source: TOML },
        { file: '/cfg/pipelines/broken.toml', source: '[[steps]]\ntool = "gzip"' },
        { file: 'C:\\cfg\\pipelines\\bad.toml', source: 'name = ' },
        { file: '/cfg/pipelines/dupe.toml', source: TOML },
      ],
    );
    expect(r.get('shout')?.category).toBe('pipeline');
    expect(r.get('broken')).toBeUndefined();
    expect(pipelines.map((p) => [p.def?.name ?? null, p.issues.map((i) => i.code)])).toEqual([
      ['shout', []],
      ['broken', ['error.pipeline.unknownTool']],
      [null, ['error.pipeline.parse']],
      ['shout', ['error.pipeline.idTaken']],
    ]);
    // search finds pipelines like tools
    expect(r.search('shout')[0]?.tool.id).toBe('shout');
  });
});
