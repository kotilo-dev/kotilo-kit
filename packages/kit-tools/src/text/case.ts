import { defineTool } from '@kotilo/kit-core';
import { type LangOption, resolveLang } from '../_lib/text.js';

const MODES = ['upper', 'lower', 'title', 'sentence', 'camel', 'pascal', 'snake', 'kebab', 'constant'] as const;
type Mode = (typeof MODES)[number];
type Opts = { mode: Mode; lang: LangOption };

/**
 * Split into words on separators and case boundaries:
 * "parseHTTPResponse_v2 İzmir-şehri" → [parse, HTTP, Response, v2, İzmir, şehri]
 */
export function words(s: string): string[] {
  return (
    s
      .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
      .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

export function convertCase(text: string, mode: Mode, lang: 'tr-TR' | 'en-US'): string {
  const up = (s: string) => s.toLocaleUpperCase(lang);
  const low = (s: string) => s.toLocaleLowerCase(lang);
  const cap = (w: string) => up(w.slice(0, 1)) + low(w.slice(1));
  // case modes keep line structure; identifier modes work per line too
  return text
    .split(/(\r?\n)/)
    .map((line) => {
      if (/^\r?\n$/.test(line)) return line;
      switch (mode) {
        case 'upper':
          return up(line);
        case 'lower':
          return low(line);
        case 'title':
          return line.replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, cap);
        case 'sentence': {
          const lower = low(line);
          return lower.replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_, pre: string, c: string) => pre + up(c));
        }
        case 'camel':
          return words(line).map((w, i) => (i === 0 ? low(w) : cap(w))).join('');
        case 'pascal':
          return words(line).map(cap).join('');
        case 'snake':
          return words(line).map(low).join('_');
        case 'kebab':
          return words(line).map(low).join('-');
        case 'constant':
          return words(line).map(up).join('_');
      }
    })
    .join('');
}

export default defineTool<Opts>({
  id: 'case',
  category: 'text',
  name: { en: 'Case converter', tr: 'Harf dönüştürücü' },
  description: { en: 'UPPER, lower, Title, camelCase, snake_case, kebab-case…', tr: 'BÜYÜK, küçük, Başlık, camelCase, snake_case, kebab-case…' },
  keywords: ['upper', 'lower', 'camel', 'snake', 'kebab', 'pascal', 'büyük', 'küçük', 'harf'],
  options: [
    { key: 'mode', type: 'select', values: MODES, default: 'upper', hotkey: 'm' },
    { key: 'lang', type: 'segmented', values: ['auto', 'tr', 'en'], default: 'auto', hotkey: 'l' },
  ],
  run(input, opts, ctx) {
    return { output: convertCase(input, opts.mode, resolveLang(opts.lang, input, ctx.locale)) };
  },
  examples: [
    { input: 'istanbul ılık', opts: { mode: 'upper', lang: 'tr' }, output: 'İSTANBUL ILIK' },
    { input: 'İSTANBUL ILIK', opts: { mode: 'lower', lang: 'tr' }, output: 'istanbul ılık' },
    { input: 'istanbul', opts: { mode: 'upper', lang: 'en' }, output: 'ISTANBUL' },
    { input: 'parseHTTPResponse v2', opts: { mode: 'snake', lang: 'en' }, output: 'parse_http_response_v2' },
    { input: 'ılık iğde ağacı', opts: { mode: 'camel', lang: 'tr' }, output: 'ılıkİğdeAğacı' },
    { input: 'merhaba dünya. nasılsın?', opts: { mode: 'sentence', lang: 'tr' }, output: 'Merhaba dünya. Nasılsın?' },
  ],
});
