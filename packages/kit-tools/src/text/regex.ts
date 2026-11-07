import { defineTool, fail } from '@kotilo/kit-core';

type Opts = { pattern: string; flags: string; mode: 'match' | 'replace'; replacement: string };

export const MAX_MATCHES = 1000;

function compile(pattern: string, flags: string): RegExp {
  const clean = [...new Set(flags.replace(/[^dgimsuvy]/g, ''))].join('');
  try {
    return new RegExp(pattern, clean.includes('g') ? clean : clean + 'g');
  } catch (e) {
    const detail = e instanceof Error ? e.message.replace(/^Invalid regular expression: /, '') : String(e);
    fail('error.regex.invalid', { detail });
  }
}

const show = (s: string) => JSON.stringify(s);

/**
 * JS regex flavour (the engine the app runs on). Patterns run on the user's own input only;
 * shells run tools in a Worker with a timeout, so a catastrophic pattern cannot freeze the UI.
 */
export default defineTool<Opts>({
  id: 'regex',
  category: 'text',
  name: { en: 'Regex tester', tr: 'Regex test' },
  description: { en: 'Test regular expressions: matches, groups, replace', tr: 'Düzenli ifadeleri test et: eşleşmeler, gruplar, değiştirme' },
  keywords: ['regex', 'regexp', 'pattern', 'match', 'replace', 'düzenli ifade'],
  options: [
    { key: 'pattern', type: 'text', default: '', hotkey: 'p' },
    { key: 'flags', type: 'text', default: 'g', hotkey: 'f' },
    { key: 'mode', type: 'segmented', values: ['match', 'replace'], default: 'match', hotkey: 'm' },
    { key: 'replacement', type: 'text', default: '', hotkey: 'r' },
  ],
  run(input, opts, ctx) {
    if (!opts.pattern) fail('error.regex.empty');
    const re = compile(opts.pattern, opts.flags);
    const global = opts.flags.includes('g');

    if (opts.mode === 'replace') {
      const target = global ? re : new RegExp(re.source, re.flags.replace('g', ''));
      const count = global ? [...input.matchAll(re)].length : Number(re.test(input));
      return { output: input.replace(target, opts.replacement), meta: { replacements: count } };
    }

    const lines: string[] = [];
    let count = 0;
    for (const m of input.matchAll(re)) {
      count++;
      if (count > MAX_MATCHES) {
        lines.push(ctx.t('tool.regex.truncated', { max: MAX_MATCHES }));
        break;
      }
      const start = m.index;
      lines.push(`#${count}  [${start}–${start + m[0].length}]  ${show(m[0])}`);
      m.slice(1).forEach((g, i) => lines.push(`    $${i + 1} = ${g === undefined ? '—' : show(g)}`));
      for (const [name, g] of Object.entries(m.groups ?? {})) {
        lines.push(`    $<${name}> = ${g === undefined ? '—' : show(g)}`);
      }
      if (!global) break;
      if (m[0] === '' && count >= MAX_MATCHES) break;
    }
    const header = count === 0 ? ctx.t('tool.regex.noMatch') : ctx.t('tool.regex.matches', { count: Math.min(count, MAX_MATCHES) });
    return { output: [header, ...lines].join('\n'), meta: { matches: Math.min(count, MAX_MATCHES) } };
  },
  examples: [
    { input: 'İzmir 35, Iğdır 76', opts: { pattern: '(\\p{Lu}\\p{Ll}+) (\\d+)', flags: 'gu', mode: 'replace', replacement: '$2=$1' }, output: '35=İzmir, 76=Iğdır' },
    { input: 'a1 b2', opts: { pattern: '\\d', mode: 'replace', replacement: '#' }, output: 'a# b#' },
    { input: 'a1 b2', opts: { pattern: '\\d', flags: '', mode: 'replace', replacement: '#' }, output: 'a# b2' },
  ],
});
