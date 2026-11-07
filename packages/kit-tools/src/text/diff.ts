import { defineTool } from '@kotilo/kit-core';
import { diffArrays, diffChars, diffWordsWithSpace } from 'diff';
import { splitLines } from '../_lib/text.js';

type Opts = { other: string; granularity: 'line' | 'word' | 'char'; ignoreWhitespace: boolean };

/**
 * Compares the input (A, left) with the `other` option (B, right).
 * Line mode → table rows `[op, lineA, lineB, text]` (op: ' ', '-', '+'), which the UI renders side by side.
 * Word/char mode → inline text with `[-removed-]{+added+}` markers.
 */
export default defineTool<Opts>({
  id: 'diff',
  category: 'text',
  name: { en: 'Text diff', tr: 'Metin farkı' },
  description: { en: 'Compare two texts line by line or character by character', tr: 'İki metni satır ya da karakter bazında karşılaştır' },
  keywords: ['diff', 'compare', 'karşılaştır', 'fark', 'patch'],
  layout: 'table',
  options: [
    { key: 'other', type: 'text', default: '', multiline: true, hotkey: 'b' },
    { key: 'granularity', type: 'segmented', values: ['line', 'word', 'char'], default: 'line', hotkey: 'g' },
    { key: 'ignoreWhitespace', type: 'toggle', default: false, hotkey: 'w' },
  ],
  run(input, opts, ctx) {
    if (opts.granularity !== 'line') {
      const parts = opts.granularity === 'word' ? diffWordsWithSpace(input, opts.other) : diffChars(input, opts.other);
      let added = 0;
      let removed = 0;
      const out = parts
        .map((p) => {
          if (p.added) {
            added += p.value.length;
            return `{+${p.value}+}`;
          }
          if (p.removed) {
            removed += p.value.length;
            return `[-${p.value}-]`;
          }
          return p.value;
        })
        .join('');
      return { output: out, meta: { added, removed, equal: added + removed === 0 } };
    }

    const rows: string[][] = [];
    let a = 1;
    let b = 1;
    let added = 0;
    let removed = 0;
    // compare as line arrays so a missing final newline is not a difference
    const left = splitLines(input);
    const right = splitLines(opts.other);
    const norm = (s: string) => s.replace(/\s+/g, '');
    const comparator = opts.ignoreWhitespace ? (x: string, y: string) => norm(x) === norm(y) : undefined;
    for (const part of diffArrays(left, right, comparator ? { comparator } : {})) {
      for (const line of part.value) {
        if (part.added) {
          rows.push(['+', '', String(b++), line]);
          added++;
        } else if (part.removed) {
          rows.push(['-', String(a++), '', line]);
          removed++;
        } else {
          rows.push([' ', String(a), String(b++), left[a - 1] ?? line]); // show A's text for equal lines
          a++;
        }
      }
    }
    return {
      output: { columns: ['', 'A', 'B', ctx.t('tool.diff.line')], rows },
      meta: { added, removed, equal: added + removed === 0 },
    };
  },
  examples: [
    { input: 'kedi', opts: { granularity: 'char', other: 'kede' }, output: 'ked[-i-]{+e+}' },
    { input: 'ılık su', opts: { granularity: 'word', other: 'sıcak su' }, output: '[-ılık-]{+sıcak+} su' },
  ],
});
