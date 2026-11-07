import { defineTool, fail } from '@kotilo/kit-core';
import { JsonSyntaxError, parseJson } from '../_lib/json.js';

type Opts = { mode: 'toJson' | 'toQuery'; nested: boolean };

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Node = string | Node[] | { [k: string]: Node };

const KEY = String.raw`[^\s=&?#/:]+`;
const VAL = String.raw`[^\s=&#]*`;
const QUERY_RE = new RegExp(`^\\??${KEY}=${VAL}(?:&${KEY}(?:=${VAL})?)*$`);

export function looksLikeQuery(input: string): number {
  const s = input.trim();
  if (s.length < 3 || s.length > 100_000 || !QUERY_RE.test(s)) return 0;
  const pairs = s.replace(/^\?/, '').split('&');
  if (pairs.length >= 2) return 0.7;
  // a single `k=v`: needs a non-empty value (so base64 padding "abc=" doesn't match)
  return /=[^=]+$/.test(pairs[0]!) ? 0.35 : 0;
}

/** Accept a bare query, `?query`, or a full URL; drop the fragment. */
function extractQuery(input: string): string {
  let s = input.trim();
  const q = s.indexOf('?');
  if (q >= 0) s = s.slice(q + 1);
  else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = '';
  const h = s.indexOf('#');
  if (h >= 0) s = s.slice(0, h);
  return s;
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '));
  } catch {
    fail('error.query.malformed', { part });
  }
}

/** `a[b][]` → ['a', 'b', '']; anything that isn't clean bracket syntax stays one key. */
function splitKey(key: string): string[] {
  const m = /^([^[\]]+)((?:\[[^[\]]*\])+)$/.exec(key);
  if (!m) return [key];
  return [m[1]!, ...[...m[2]!.matchAll(/\[([^[\]]*)\]/g)].map((x) => x[1]!)];
}

const isObj = (v: unknown): v is Record<string, Node> => !!v && typeof v === 'object' && !Array.isArray(v);

function assign(root: Record<string, Node>, path: string[], value: string, rawKey: string): void {
  let cur: Record<string, Node> | Node[] = root;
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]!;
    const last = i === path.length - 1;
    if (Array.isArray(cur)) {
      // `a[]` push; a further path below a push makes a fresh object
      if (last) {
        cur.push(value);
        return;
      }
      const next: Node = path[i + 1] === '' ? [] : {};
      cur.push(next);
      cur = next as Record<string, Node> | Node[];
      continue;
    }
    if (seg === '' && i > 0) fail('error.query.conflict', { key: rawKey });
    const existing: Node | undefined = Object.hasOwn(cur, seg) ? cur[seg] : undefined;
    if (last) {
      if (existing === undefined) cur[seg] = value;
      else if (Array.isArray(existing)) existing.push(value);
      else if (typeof existing === 'string') cur[seg] = [existing, value];
      else fail('error.query.conflict', { key: rawKey });
      return;
    }
    const wantArray = path[i + 1] === '';
    if (existing === undefined) {
      const next: Node = wantArray ? [] : {};
      cur[seg] = next;
      cur = next as Record<string, Node> | Node[];
    } else if (wantArray && typeof existing === 'string') {
      const next: Node[] = [existing];
      cur[seg] = next;
      cur = next;
    } else if (wantArray ? Array.isArray(existing) : isObj(existing)) {
      cur = existing as Record<string, Node> | Node[];
    } else fail('error.query.conflict', { key: rawKey });
  }
}

/** Objects keyed exactly 0..n-1 (from `a[0]=…&a[1]=…`) become arrays. */
function denseArrays(v: Node): Node {
  if (Array.isArray(v)) return v.map(denseArrays);
  if (!isObj(v)) return v;
  const keys = Object.keys(v);
  const out: Record<string, Node> = {};
  for (const k of keys) out[k] = denseArrays(v[k]!);
  if (keys.length && keys.every((k, i) => k === String(i))) return keys.map((k) => out[k]!);
  return out;
}

function toJson(input: string, nested: boolean) {
  const query = extractQuery(input);
  const root: Record<string, Node> = {};
  let params = 0;
  for (const pair of query.split(/&/)) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = decode(eq >= 0 ? pair.slice(0, eq) : pair);
    const value = eq >= 0 ? decode(pair.slice(eq + 1)) : '';
    if (!rawKey) continue;
    params++;
    assign(root, nested ? splitKey(rawKey) : [rawKey], value, rawKey);
  }
  const out = nested ? denseArrays(root) : root;
  return { output: JSON.stringify(out, null, 2), mime: 'application/json', meta: { params } };
}

const enc = (s: string) => encodeURIComponent(s);

function scalar(v: Json): string {
  if (v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function toQuery(input: string, nested: boolean) {
  let value: unknown;
  try {
    value = parseJson(input);
  } catch (e) {
    if (e instanceof JsonSyntaxError) fail('error.query.json', { line: e.info.line, column: e.info.column });
    throw e;
  }
  if (!isObj(value)) fail('error.query.notObject');
  const parts: string[] = [];
  const walk = (key: string, v: Json) => {
    if (Array.isArray(v)) {
      // primitives: repeated keys (round-trips with toJson); objects need an index
      v.forEach((item, i) => {
        if (nested && item !== null && typeof item === 'object') walk(`${key}[${i}]`, item);
        else parts.push(`${key}=${enc(scalar(item))}`);
      });
      return;
    }
    if (nested && v !== null && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) walk(`${key}[${enc(k)}]`, child);
      return;
    }
    parts.push(`${key}=${enc(scalar(v))}`);
  };
  for (const [k, v] of Object.entries(value as Record<string, Json>)) walk(enc(k), v);
  return { output: parts.join('&'), meta: { params: parts.length } };
}

export default defineTool<Opts>({
  id: 'query',
  category: 'web',
  name: { en: 'Query string', tr: 'Query string' },
  description: { en: 'Convert a URL query string to JSON and back', tr: 'URL query string’i JSON’a ve geri dönüştür' },
  keywords: ['query', 'querystring', 'qs', 'params', 'url', 'json', 'parametre', 'sorgu'],
  detect: looksLikeQuery,
  options: [
    { key: 'mode', type: 'segmented', values: ['toJson', 'toQuery'], default: 'toJson', hotkey: 'm' },
    { key: 'nested', type: 'toggle', default: true, hotkey: 'n' },
  ],
  run(input, opts) {
    if (opts.mode === 'toQuery') {
      if (!input.trim()) return { output: '', meta: { params: 0 } };
      return toQuery(input, opts.nested);
    }
    return toJson(input, opts.nested);
  },
  examples: [
    { input: 'a=1&b=x+y&b=z', output: '{\n  "a": "1",\n  "b": [\n    "x y",\n    "z"\n  ]\n}' },
    { input: 'https://kotilo.dev/ara?q=%C4%B0zmir&f[tip]=il#sonuç', output: '{\n  "q": "İzmir",\n  "f": {\n    "tip": "il"\n  }\n}' },
    { input: '{"şehir":"Iğdır","tag":["a","b"]}', opts: { mode: 'toQuery' }, output: '%C5%9Fehir=I%C4%9Fd%C4%B1r&tag=a&tag=b' },
    { input: '{"f":{"tip":"il"}}', opts: { mode: 'toQuery' }, output: 'f[tip]=il' },
  ],
});
