import { defineTool } from '@kotilo/kit-core';
import { type LangOption, resolveLang, splitLines } from '../_lib/text.js';

const OPS = ['sort', 'sort-desc', 'unique', 'reverse', 'remove-empty', 'number', 'trim'] as const;
type Opts = { op: (typeof OPS)[number]; ignoreCase: boolean; numeric: boolean; lang: LangOption };

export default defineTool<Opts>({
  id: 'lines',
  category: 'text',
  name: { en: 'Line tools', tr: 'Satır işlemleri' },
  description: { en: 'Sort, dedupe, reverse, number or clean up lines', tr: 'Satırları sırala, tekilleştir, ters çevir, numaralandır, temizle' },
  keywords: ['sort', 'unique', 'dedupe', 'uniq', 'reverse', 'sırala', 'tekil', 'satır'],
  options: [
    { key: 'op', type: 'select', values: OPS, default: 'sort', hotkey: 'o' },
    { key: 'ignoreCase', type: 'toggle', default: false, hotkey: 'i' },
    { key: 'numeric', type: 'toggle', default: true, hotkey: 'n' },
    { key: 'lang', type: 'segmented', values: ['auto', 'tr', 'en'], default: 'auto', hotkey: 'l' },
  ],
  run(input, opts, ctx) {
    const lang = resolveLang(opts.lang, input, ctx.locale);
    const lines = splitLines(input);
    if (lines.length > 1 && lines.at(-1) === '') lines.pop(); // trailing newline is not a line
    const collator = new Intl.Collator(lang, {
      sensitivity: opts.ignoreCase ? 'base' : 'variant',
      numeric: opts.numeric,
    });
    let out: string[];
    switch (opts.op) {
      case 'sort':
        out = [...lines].sort(collator.compare);
        break;
      case 'sort-desc':
        out = [...lines].sort((a, b) => collator.compare(b, a));
        break;
      case 'unique': {
        const seen = new Set<string>();
        out = lines.filter((l) => {
          const k = opts.ignoreCase ? l.toLocaleLowerCase(lang) : l;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        break;
      }
      case 'reverse':
        out = [...lines].reverse();
        break;
      case 'remove-empty':
        out = lines.filter((l) => l.trim() !== '');
        break;
      case 'number': {
        const w = String(lines.length).length;
        out = lines.map((l, i) => `${String(i + 1).padStart(w)}  ${l}`);
        break;
      }
      case 'trim':
        out = lines.map((l) => l.trim());
        break;
    }
    return { output: out.join('\n'), meta: { lines: out.length, removed: lines.length - out.length } };
  },
  examples: [
    { input: 'şeker\nçay\ncam\nsu\nıhlamur\nincir', opts: { op: 'sort', lang: 'tr' }, output: 'cam\nçay\nıhlamur\nincir\nsu\nşeker' },
    { input: 'item10\nitem2\nitem1', opts: { op: 'sort' }, output: 'item1\nitem2\nitem10' },
    { input: 'a\nb\na\nB', opts: { op: 'unique', ignoreCase: true }, output: 'a\nb' },
    { input: 'a\n\n  \nb', opts: { op: 'remove-empty' }, output: 'a\nb' },
    { input: 'x\ny', opts: { op: 'number' }, output: '1  x\n2  y' },
  ],
});
