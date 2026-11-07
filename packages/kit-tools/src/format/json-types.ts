import { defineTool, fail } from '@kotilo/kit-core';
import { resolveLang } from '../_lib/text.js';
import { parseOrFail } from './json.js';

type Opts = { lang: 'typescript' | 'kotlin'; root: string; tsStyle: 'interface' | 'type' };

// ---------- shape inference ----------

interface Field {
  key: string;
  shape: Shape;
  optional: boolean;
}
type Shape =
  | { t: 'string' | 'float' | 'bool' | 'null' | 'unknown' }
  | { t: 'int'; long: boolean }
  | { t: 'array'; of: Shape }
  | { t: 'object'; fields: Field[] }
  | { t: 'union'; of: Shape[] };

const INT32 = 2 ** 31;

function infer(v: unknown): Shape {
  if (v === null) return { t: 'null' };
  if (typeof v === 'string') return { t: 'string' };
  if (typeof v === 'boolean') return { t: 'bool' };
  if (typeof v === 'number') return Number.isInteger(v) ? { t: 'int', long: v >= INT32 || v < -INT32 } : { t: 'float' };
  if (Array.isArray(v)) return { t: 'array', of: v.map(infer).reduce<Shape>(merge, { t: 'unknown' }) };
  const fields = Object.entries(v as Record<string, unknown>).map(([key, val]) => ({ key, shape: infer(val), optional: false }));
  return { t: 'object', fields };
}

const kindOf = (s: Shape) => (s.t === 'int' || s.t === 'float' ? 'number' : s.t);
const members = (s: Shape): Shape[] => (s.t === 'union' ? s.of : s.t === 'unknown' ? [] : [s]);

/** Merge two shapes: same kinds combine (objects field-wise), different kinds form a union. */
function merge(a: Shape, b: Shape): Shape {
  const out: Shape[] = [];
  for (const s of [...members(a), ...members(b)]) {
    const i = out.findIndex((o) => kindOf(o) === kindOf(s));
    if (i < 0) out.push(s);
    else out[i] = mergeSame(out[i]!, s);
  }
  if (out.length === 0) return { t: 'unknown' };
  return out.length === 1 ? out[0]! : { t: 'union', of: out };
}

function mergeSame(a: Shape, b: Shape): Shape {
  if (a.t === 'int' && b.t === 'int') return { t: 'int', long: a.long || b.long };
  if (kindOf(a) === 'number') return a.t === b.t ? a : { t: 'float' };
  if (a.t === 'array' && b.t === 'array') return { t: 'array', of: merge(a.of, b.of) };
  if (a.t === 'object' && b.t === 'object') {
    const fields: Field[] = a.fields.map((f) => {
      const other = b.fields.find((g) => g.key === f.key);
      return other
        ? { key: f.key, shape: merge(f.shape, other.shape), optional: f.optional || other.optional }
        : { ...f, optional: true };
    });
    for (const g of b.fields) if (!a.fields.some((f) => f.key === g.key)) fields.push({ ...g, optional: true });
    return { t: 'object', fields };
  }
  return a;
}

const signature = (s: Shape): string => JSON.stringify(s);

// ---------- naming ----------

function pascal(raw: string): string {
  const lang = resolveLang('auto', raw, 'en');
  const words = raw.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let name = words
    .map((w) => w.charAt(0).toLocaleUpperCase(lang) + w.slice(1))
    .join('');
  if (!name) name = 'Item';
  if (/^\p{N}/u.test(name)) name = `T${name}`;
  return name;
}

function singular(name: string): string {
  if (/ies$/.test(name) && name.length > 4) return `${name.slice(0, -3)}y`;
  if (/(?:ler|lar)$/.test(name) && name.length > 5) return name.slice(0, -3);
  if (/[^s]s$/.test(name) && name.length > 2) return name.slice(0, -1);
  return `${name}Item`;
}

// ---------- rendering ----------

interface Decl {
  name: string;
  fields: Field[];
}

class Namer {
  readonly decls: Decl[] = [];
  private bySig = new Map<string, string>();
  private used = new Set<string>();

  name(shape: Extract<Shape, { t: 'object' }>, hint: string): string {
    const sig = signature(shape);
    const known = this.bySig.get(sig);
    if (known) return known;
    let name = hint;
    for (let n = 2; this.used.has(name); n++) name = `${hint}${n}`;
    this.used.add(name);
    this.bySig.set(sig, name);
    this.decls.push({ name, fields: shape.fields });
    return name;
  }
}

const TS_IDENT = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;
const KT_IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const KT_KEYWORDS = new Set(
  'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while'.split(
    ' ',
  ),
);

function renderTs(shape: Shape, hint: string, namer: Namer): string {
  switch (shape.t) {
    case 'string':
      return 'string';
    case 'int':
    case 'float':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'null':
      return 'null';
    case 'unknown':
      return 'unknown';
    case 'object':
      return namer.name(shape, hint);
    case 'array': {
      const inner = renderTs(shape.of, singular(hint), namer);
      return shape.of.t === 'union' ? `(${inner})[]` : `${inner}[]`;
    }
    case 'union': {
      const sorted = [...shape.of.filter((s) => s.t !== 'null'), ...shape.of.filter((s) => s.t === 'null')];
      return sorted.map((s) => renderTs(s, hint, namer)).join(' | ');
    }
  }
}

function renderKt(shape: Shape, hint: string, namer: Namer): string {
  switch (shape.t) {
    case 'string':
      return 'String';
    case 'int':
      return shape.long ? 'Long' : 'Int';
    case 'float':
      return 'Double';
    case 'bool':
      return 'Boolean';
    case 'null':
      return 'Any?';
    case 'unknown':
      return 'Any';
    case 'object':
      return namer.name(shape, hint);
    case 'array':
      return `List<${renderKt(shape.of, singular(hint), namer)}>`;
    case 'union': {
      const nonNull = shape.of.filter((s) => s.t !== 'null');
      const nullable = nonNull.length < shape.of.length;
      const base = nonNull.length === 1 ? renderKt(nonNull[0]!, hint, namer) : 'Any';
      return nullable && !base.endsWith('?') ? `${base}?` : base;
    }
  }
}

function emitTs(value: unknown, root: string, style: 'interface' | 'type'): string {
  const namer = new Namer();
  const shape = infer(value);
  const out: string[] = [];
  if (shape.t !== 'object') out.push(`export type ${root} = ${renderTs(shape, root, namer)};`);
  else namer.name(shape, root);
  // decls grows while rendering nested fields
  for (let i = 0; i < namer.decls.length; i++) {
    const d = namer.decls[i]!;
    const lines = d.fields.map((f) => {
      const key = TS_IDENT.test(f.key) ? f.key : JSON.stringify(f.key);
      return `  ${key}${f.optional ? '?' : ''}: ${renderTs(f.shape, pascal(f.key), namer)};`;
    });
    const body = lines.length ? `{\n${lines.join('\n')}\n}` : '{}';
    out.push(style === 'interface' ? `export interface ${d.name} ${body}` : `export type ${d.name} = ${body};`);
  }
  return out.join('\n\n');
}

function emitKt(value: unknown, root: string): string {
  const namer = new Namer();
  const shape = infer(value);
  const out: string[] = [];
  if (shape.t !== 'object') out.push(`typealias ${root} = ${renderKt(shape, root, namer)}`);
  else namer.name(shape, root);
  for (let i = 0; i < namer.decls.length; i++) {
    const d = namer.decls[i]!;
    if (!d.fields.length) {
      out.push(`class ${d.name}`);
      continue;
    }
    const lines = d.fields.map((f) => {
      const key = KT_IDENT.test(f.key) && !KT_KEYWORDS.has(f.key) ? f.key : `\`${f.key.replace(/`/g, '')}\``;
      let type = renderKt(f.shape, pascal(f.key), namer);
      const nullable = f.optional || type.endsWith('?');
      if (nullable && !type.endsWith('?')) type += '?';
      return `    val ${key}: ${type}${nullable ? ' = null' : ''}`;
    });
    out.push(`data class ${d.name}(\n${lines.join(',\n')}\n)`);
  }
  return out.join('\n\n');
}

export default defineTool<Opts>({
  id: 'json-types',
  category: 'format',
  name: { en: 'JSON to types', tr: 'JSON’dan tip' },
  description: {
    en: 'Generate TypeScript or Kotlin types from JSON',
    tr: 'JSON’dan TypeScript veya Kotlin tipleri üret',
  },
  keywords: ['json', 'typescript', 'kotlin', 'interface', 'type', 'data class', 'quicktype', 'tip', 'üret'],
  options: [
    { key: 'lang', type: 'select', values: ['typescript', 'kotlin'], default: 'typescript', hotkey: 'l' },
    { key: 'root', type: 'text', default: 'Root', hotkey: 'r' },
    { key: 'tsStyle', type: 'segmented', values: ['interface', 'type'], default: 'interface', hotkey: 's' },
  ],
  run(input, opts) {
    if (!input.trim()) fail('error.json.empty');
    const value = parseOrFail(input);
    const root = opts.root.trim() ? pascal(opts.root.trim()) : 'Root';
    const output = opts.lang === 'kotlin' ? emitKt(value, root) : emitTs(value, root, opts.tsStyle);
    const types = (output.match(/^(?:export (?:interface|type)|data class|class|typealias) /gm) ?? []).length;
    return { output, mime: opts.lang === 'kotlin' ? 'text/x-kotlin' : 'application/typescript', meta: { types } };
  },
  examples: [
    {
      input: '{"id":1,"name":"Ayşe","tags":["a"]}',
      output: 'export interface Root {\n  id: number;\n  name: string;\n  tags: string[];\n}',
    },
    {
      input: '{"user":{"id":1,"e-mail":"x"}}',
      opts: { tsStyle: 'type' },
      output: 'export type Root = {\n  user: User;\n};\n\nexport type User = {\n  id: number;\n  "e-mail": string;\n};',
    },
    {
      input: '{"items":[{"id":1,"note":null},{"id":2.5}]}',
      opts: { lang: 'kotlin' },
      output:
        'data class Root(\n    val items: List<Item>\n)\n\ndata class Item(\n    val id: Double,\n    val note: Any? = null\n)',
    },
  ],
});
