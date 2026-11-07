import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createContext,
  createRegistry,
  isToolError,
  messages,
  resultText,
  runTool,
  type Locale,
  type TableOutput,
  type ToolResult,
} from '@kotilo/kit-core';
import { describe, expect, it } from 'vitest';
import { builtinTools } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = join(here, '../../../tools-spec');
const SRC_DIR = join(here, '../src');

interface SpecCase {
  name: string;
  input: string;
  opts?: Record<string, unknown>;
  ctx?: { now?: string; tz?: string; locale?: Locale };
  expect: {
    output?: string;
    contains?: string[];
    rows?: string[][];
    error?: string;
    meta?: Record<string, unknown>;
  };
}

/** Deterministic randomness for tests. */
const seeded = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
const fixedCtx = (c: SpecCase['ctx'] = {}) =>
  createContext({
    locale: c.locale ?? 'en',
    now: new Date(c.now ?? '2026-01-01T00:00:00Z'),
    tz: c.tz ?? 'UTC',
    random: seeded,
  });

const text = (r: ToolResult) => (typeof r.output === 'string' ? r.output : JSON.stringify(r.output));

describe.each(builtinTools.map((t) => [t.id, t] as const))('%s', (id, tool) => {
  it('has unique option keys and hotkeys', () => {
    const hotkeys = tool.options.flatMap((o) => o.hotkey ?? []);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
  });

  it.each(tool.examples.map((ex, i) => [i, ex] as const))('example %i', (_, ex) => {
    // table results compare as the aligned text the CLI prints (and `kotilo <tool> --help` shows)
    expect(resultText(runTool(tool, ex.input, ex.opts, fixedCtx()))).toBe(ex.output);
  });

  let spec: { tool: string; cases: SpecCase[] } | null = null;
  try {
    spec = JSON.parse(readFileSync(join(SPEC_DIR, `${id}.json`), 'utf8'));
  } catch {
    spec = null;
  }

  it('has an acceptance table in tools-spec/', () => {
    expect(spec?.tool).toBe(id);
  });

  for (const c of spec?.cases ?? []) {
    it(`spec: ${c.name}`, () => {
      const run = () => runTool(tool, c.input, c.opts, fixedCtx(c.ctx));
      if (c.expect.error) {
        let thrown: unknown;
        try {
          run();
        } catch (e) {
          thrown = e;
        }
        expect(isToolError(thrown), `expected ToolError ${c.expect.error}, got ${String(thrown)}`).toBe(true);
        expect((thrown as { code: string }).code).toBe(c.expect.error);
        return;
      }
      const result = run();
      if (c.expect.output !== undefined) expect(result.output).toBe(c.expect.output);
      for (const s of c.expect.contains ?? []) expect(text(result)).toContain(s);
      if (c.expect.rows) {
        const rows = (result.output as TableOutput).rows;
        let from = 0;
        for (const want of c.expect.rows) {
          const idx = rows.findIndex((r, i) => i >= from && JSON.stringify(r) === JSON.stringify(want));
          expect(idx, `row ${JSON.stringify(want)} in ${JSON.stringify(rows)}`).toBeGreaterThanOrEqual(0);
          from = idx + 1;
        }
      }
      if (c.expect.meta) expect(result.meta).toMatchObject(c.expect.meta);
    });
  }
});

describe('detect fixtures', () => {
  const registry = createRegistry(builtinTools);
  const fixtures: { input: string; top: string | null }[] = JSON.parse(
    readFileSync(join(SPEC_DIR, 'detect-fixtures.json'), 'utf8'),
  );
  it.each(fixtures.map((f) => [JSON.stringify(f.input).slice(0, 50), f] as const))('%s', (_, f) => {
    const hits = registry.detect(f.input, { budgetMs: Infinity });
    expect(hits[0]?.tool.id ?? null).toBe(f.top);
  });

  it('every tool with detect() has at least one fixture', () => {
    const covered = new Set(fixtures.map((f) => f.top));
    for (const tool of builtinTools.filter((t) => t.detect)) expect(covered, tool.id).toContain(tool.id);
  });
});

describe('i18n', () => {
  const en = messages('en');
  const tr = messages('tr');

  it('EN and TR have the same keys', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(builtinTools.map((t) => [t.id, t] as const))('%s: names, descriptions, option labels', (id, tool) => {
    for (const [locale, bundle] of [['en', en], ['tr', tr]] as const) {
      expect(bundle[`tool.${id}.name`]).toBe(tool.name[locale]);
      expect(bundle[`tool.${id}.description`]).toBe(tool.description[locale]);
      expect(bundle[`category.${tool.category}`]).toBeTruthy();
      for (const opt of tool.options) {
        expect(bundle[`tool.${id}.opt.${opt.key}`], `${locale} tool.${id}.opt.${opt.key}`).toBeTruthy();
        if (opt.type === 'segmented' || opt.type === 'select') {
          for (const v of opt.values) {
            expect(bundle[`tool.${id}.opt.${opt.key}.${v}`], `${locale} tool.${id}.opt.${opt.key}.${v}`).toBeTruthy();
          }
        }
      }
    }
  });

  it('every i18n key referenced in tool sources exists', () => {
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(join(SRC_DIR, f), 'utf8');
      for (const m of src.matchAll(/['`]((?:error|tool)\.[\w.-]+)['`]/g)) {
        const key = m[1]!;
        if (key.endsWith('.')) continue; // dynamic prefix
        if (!(key in en)) missing.push(`${f}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('purity', () => {
  // Tools are pure: no network, no DOM, no clock, no ambient randomness (use ctx.now / ctx.random).
  const banned = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bdocument\./,
    /\bwindow\./,
    /\blocalStorage\b/,
    /Date\.now\s*\(/,
    /new Date\(\s*\)/,
    /Math\.random\s*\(/,
    /\bcrypto\./,
    /from ['"]node:/,
  ];
  const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
  it.each(files)('%s', (f) => {
    const src = readFileSync(join(SRC_DIR, f), 'utf8');
    for (const re of banned) expect(re.test(src), `${f} matches ${re}`).toBe(false);
  });
});
