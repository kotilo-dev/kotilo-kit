import { defineTool, fail } from '@kotilo/kit-core';
import { JsonSyntaxError, jsonPath, parseJson, sortKeys } from '../_lib/json.js';

type Opts = { mode: 'format' | 'minify'; indent: '2' | '4' | 'tab'; sortKeys: boolean; query: string };

export function looksLikeJson(input: string): number {
  const s = input.trim();
  if (!/^[[{]/.test(s) || !/[\]}]$/.test(s)) return 0;
  try {
    JSON.parse(s);
    return 0.9;
  } catch {
    return 0.4; // probably broken JSON — still worth suggesting (shows the error)
  }
}

export function parseOrFail(input: string): unknown {
  try {
    return parseJson(input);
  } catch (e) {
    if (e instanceof JsonSyntaxError) {
      const { line, column, reason, found } = e.info;
      fail(`error.json.${reason}`, { line, column, found });
    }
    throw e;
  }
}

export default defineTool<Opts>({
  id: 'json',
  category: 'format',
  name: { en: 'JSON format', tr: 'JSON biçimlendir' },
  description: { en: 'Format, minify, validate and query JSON', tr: 'JSON biçimlendir, küçült, doğrula ve sorgula' },
  keywords: ['json', 'pretty', 'beautify', 'minify', 'validate', 'jsonpath', 'güzelleştir'],
  detect: looksLikeJson,
  options: [
    { key: 'mode', type: 'segmented', values: ['format', 'minify'], default: 'format', hotkey: 'm' },
    { key: 'indent', type: 'segmented', values: ['2', '4', 'tab'], default: '2', hotkey: 'i' },
    { key: 'sortKeys', type: 'toggle', default: false, hotkey: 's' },
    { key: 'query', type: 'text', default: '', hotkey: 'q' },
  ],
  run(input, opts, ctx) {
    if (!input.trim()) fail('error.json.empty');
    let value = parseOrFail(input);
    if (opts.sortKeys) value = sortKeys(value, new Intl.Collator(ctx.locale === 'tr' ? 'tr-TR' : 'en-US'));
    let matches: number | undefined;
    if (opts.query.trim()) {
      try {
        const result = jsonPath(value, opts.query);
        matches = result.length;
        value = result;
      } catch {
        fail('error.json.query', { query: opts.query });
      }
    }
    const indent = opts.mode === 'minify' ? undefined : opts.indent === 'tab' ? '\t' : Number(opts.indent);
    return {
      output: JSON.stringify(value, null, indent),
      mime: 'application/json',
      meta: { valid: true, ...(matches !== undefined ? { matches } : {}) },
    };
  },
  examples: [
    { input: '{"a":1,"b":[true,null]}', output: '{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}' },
    { input: '{ "a" : 1 ,\n "b" : 2 }', opts: { mode: 'minify' }, output: '{"a":1,"b":2}' },
    { input: '{"şehir":"İzmir","ad":"Çağrı"}', opts: { mode: 'minify', sortKeys: true }, output: '{"ad":"Çağrı","şehir":"İzmir"}' },
    { input: '{"users":[{"name":"a"},{"name":"b"}]}', opts: { mode: 'minify', query: '$.users[*].name' }, output: '["a","b"]' },
  ],
});
