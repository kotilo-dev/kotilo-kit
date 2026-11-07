/**
 * Check one tool before it is registered in src/index.ts:
 *   pnpm check-tool <id> [--i18n fragment.json] [--fixtures fixtures.json]
 *
 * Runs what spec.test.ts runs for that tool (examples, tools-spec/<id>.json, option labels, purity) and
 * checks detect against ALL existing fixtures, so a new detector can't steal another tool's input.
 * `--i18n` merges `{ "en": {...}, "tr": {...} }` over the bundles in memory; `--fixtures` adds `[{input, top}]`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createContext,
  createRegistry,
  isToolError,
  messages,
  resultText,
  runTool,
  type Locale,
  type TableOutput,
  type Tool,
  type ToolResult,
} from '@kotilo/kit-core';
import { builtinTools } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../..');
const SRC = join(here, '../src');
const args = process.argv.slice(2);
const id = args[0];
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!id) {
  console.error('usage: check-tool.ts <id> [--i18n fragment.json] [--fixtures fixtures.json]');
  process.exit(2);
}

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

// ---- i18n fragment ----
const i18nPath = flag('--i18n');
if (i18nPath) {
  const frag = JSON.parse(readFileSync(i18nPath, 'utf8')) as Record<Locale, Record<string, string>>;
  for (const l of ['en', 'tr'] as const) Object.assign(messages(l), frag[l] ?? {});
  const en = Object.keys(frag.en ?? {}).sort();
  const tr = Object.keys(frag.tr ?? {}).sort();
  if (JSON.stringify(en) !== JSON.stringify(tr)) fail(`i18n fragment: EN and TR keys differ`);
}

// ---- load the tool ----
const file = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).find(
  (f) => f.replace(/\\/g, '/').endsWith(`/${id}.ts`) && !f.startsWith('_lib'),
);
if (!file) {
  console.error(`no src/<category>/${id}.ts`);
  process.exit(2);
}
const mod = (await import(pathToFileURL(join(SRC, file)).href)) as { default: Tool<any> };
const tool = mod.default;
console.log(`${tool.id} (${file})`);
if (tool.id !== id) fail(`id is "${tool.id}", file is ${id}.ts`);
if (!file.replace(/\\/g, '/').startsWith(`${tool.category}/`)) fail(`category ${tool.category} but file in ${file}`);

// ---- context like spec.test.ts ----
const seeded = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
const ctxFor = (c: { now?: string; tz?: string; locale?: Locale } = {}) =>
  createContext({ locale: c.locale ?? 'en', now: new Date(c.now ?? '2026-01-01T00:00:00Z'), tz: c.tz ?? 'UTC', random: seeded });
const text = (r: ToolResult) => (typeof r.output === 'string' ? r.output : JSON.stringify(r.output));

// ---- examples ----
if (tool.examples.length < 3) fail(`needs ≥ 3 examples (has ${tool.examples.length})`);
tool.examples.forEach((ex, i) => {
  try {
    const out = resultText(runTool(tool, ex.input, ex.opts, ctxFor()));
    if (out !== ex.output) fail(`example ${i}: got ${JSON.stringify(out)} want ${JSON.stringify(ex.output)}`);
  } catch (e) {
    fail(`example ${i} threw ${String(e)}`);
  }
});
ok(`${tool.examples.length} examples`);

// ---- option keys / hotkeys ----
const keys = tool.options.map((o) => o.key);
const hot = tool.options.flatMap((o) => (o.hotkey ? [o.hotkey] : []));
if (new Set(keys).size !== keys.length) fail('duplicate option keys');
if (new Set(hot).size !== hot.length) fail('duplicate hotkeys');

// ---- acceptance table ----
interface SpecCase {
  name: string;
  input: string;
  opts?: Record<string, unknown>;
  ctx?: { now?: string; tz?: string; locale?: Locale };
  expect: { output?: string; contains?: string[]; rows?: string[][]; error?: string; meta?: Record<string, unknown> };
}
let spec: { tool: string; cases: SpecCase[] } | undefined;
try {
  spec = JSON.parse(readFileSync(join(ROOT, 'tools-spec', `${id}.json`), 'utf8'));
} catch {
  fail(`missing or invalid tools-spec/${id}.json`);
}
if (spec && spec.tool !== id) fail(`tools-spec/${id}.json has tool "${spec.tool}"`);
for (const c of spec?.cases ?? []) {
  const where = `spec "${c.name}"`;
  let result: ToolResult;
  try {
    result = runTool(tool, c.input, c.opts, ctxFor(c.ctx));
  } catch (e) {
    if (c.expect.error) {
      if (!isToolError(e)) fail(`${where}: expected ToolError ${c.expect.error}, got ${String(e)}`);
      else if (e.code !== c.expect.error) fail(`${where}: error ${e.code}, want ${c.expect.error}`);
    } else fail(`${where}: threw ${String(e)}`);
    continue;
  }
  if (c.expect.error) {
    fail(`${where}: expected error ${c.expect.error}, got ${JSON.stringify(text(result))}`);
    continue;
  }
  if (c.expect.output !== undefined && result.output !== c.expect.output)
    fail(`${where}: got ${JSON.stringify(result.output)} want ${JSON.stringify(c.expect.output)}`);
  for (const s of c.expect.contains ?? []) if (!text(result).includes(s)) fail(`${where}: output lacks ${JSON.stringify(s)}\n${text(result)}`);
  if (c.expect.rows) {
    const rows = (result.output as TableOutput).rows ?? [];
    let from = 0;
    for (const want of c.expect.rows) {
      const idx = rows.findIndex((r, i) => i >= from && JSON.stringify(r) === JSON.stringify(want));
      if (idx < 0) fail(`${where}: row ${JSON.stringify(want)} not found in order in ${JSON.stringify(rows)}`);
      else from = idx + 1;
    }
  }
  for (const [k, v] of Object.entries(c.expect.meta ?? {}))
    if (JSON.stringify(result.meta?.[k]) !== JSON.stringify(v)) fail(`${where}: meta.${k} = ${JSON.stringify(result.meta?.[k])}, want ${JSON.stringify(v)}`);
}
ok(`${spec?.cases.length ?? 0} spec cases`);

// ---- i18n labels ----
for (const l of ['en', 'tr'] as const) {
  const b = messages(l);
  if (b[`tool.${id}.name`] !== tool.name[l]) fail(`${l}: tool.${id}.name must equal name.${l}`);
  if (b[`tool.${id}.description`] !== tool.description[l]) fail(`${l}: tool.${id}.description must equal description.${l}`);
  if (tool.detect && !b[`kind.${id}`]) fail(`${l}: kind.${id} missing (palette "… detected in clipboard")`);
  for (const o of tool.options) {
    if (!b[`tool.${id}.opt.${o.key}`]) fail(`${l}: tool.${id}.opt.${o.key} missing`);
    if (o.type === 'segmented' || o.type === 'select')
      for (const v of o.values) if (!b[`tool.${id}.opt.${o.key}.${v}`]) fail(`${l}: tool.${id}.opt.${o.key}.${v} missing`);
  }
}
const src = readFileSync(join(SRC, file), 'utf8');
for (const m of src.matchAll(/['`]((?:error|tool)\.[\w.-]+)['`]/g)) {
  if (!m[1]!.endsWith('.') && !(m[1]! in messages('en'))) fail(`i18n key used but missing: ${m[1]}`);
}
ok('i18n');

// ---- purity ----
const banned = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bdocument\./, /\bwindow\./, /\blocalStorage\b/, /Date\.now\s*\(/, /new Date\(\s*\)/, /Math\.random\s*\(/, /\bcrypto\./, /from ['"]node:/];
for (const re of banned) if (re.test(src)) fail(`purity: matches ${re}`);
ok('purity');

// ---- detect vs all fixtures ----
const fixtures = JSON.parse(readFileSync(join(ROOT, 'tools-spec', 'detect-fixtures.json'), 'utf8')) as { input: string; top: string | null }[];
const extraPath = flag('--fixtures');
const extra = extraPath ? (JSON.parse(readFileSync(extraPath, 'utf8')) as typeof fixtures) : [];
const registry = createRegistry([...builtinTools.filter((t) => t.id !== id), tool]);
for (const f of [...fixtures, ...extra]) {
  const top = registry.detect(f.input, { budgetMs: Infinity })[0]?.tool.id ?? null;
  if (top !== f.top) fail(`detect: ${JSON.stringify(f.input.slice(0, 60))} → ${top}, want ${f.top}`);
}
if (tool.detect && ![...fixtures, ...extra].some((f) => f.top === id)) fail('detect(): add at least one fixture with top = this tool');
ok(`detect vs ${fixtures.length + extra.length} fixtures`);

if (failures.length) {
  console.log(`\n✗ ${failures.length} problem(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
