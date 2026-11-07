import { defineTool } from '@kotilo/kit-core';
import { utf8Encode } from '../_lib/bytes.js';
import { type LangOption, resolveLang, shortDuration, splitLines } from '../_lib/text.js';

type Opts = { lang: LangOption };

const WORDS_PER_MINUTE = 200;

export interface TextCounts {
  characters: number;
  codePoints: number;
  utf16: number;
  bytes: number;
  words: number;
  lines: number;
  nonEmptyLines: number;
  sentences: number;
  paragraphs: number;
  whitespace: number;
}

export function countText(text: string, lang: 'tr-TR' | 'en-US'): TextCounts {
  const segments = (granularity: 'grapheme' | 'word' | 'sentence') =>
    new Intl.Segmenter(lang, { granularity }).segment(text);
  let characters = 0;
  for (const _ of segments('grapheme')) characters++;
  let words = 0;
  for (const s of segments('word')) if (s.isWordLike) words++;
  let sentences = 0;
  for (const s of segments('sentence')) if (/[\p{L}\p{N}]/u.test(s.segment)) sentences++;

  const lines = text === '' ? [] : splitLines(text);
  if (lines.length > 1 && lines.at(-1) === '') lines.pop(); // a trailing newline does not start a line
  return {
    characters,
    codePoints: [...text].length,
    utf16: text.length,
    bytes: utf8Encode(text).length,
    words,
    lines: lines.length,
    nonEmptyLines: lines.filter((l) => l.trim() !== '').length,
    sentences,
    paragraphs: text.split(/\r?\n[ \t]*\r?\n/).filter((p) => p.trim() !== '').length,
    whitespace: text.match(/\s/gu)?.length ?? 0,
  };
}

export default defineTool<Opts>({
  id: 'count',
  category: 'text',
  name: { en: 'Text counter', tr: 'Metin sayacı' },
  description: {
    en: 'Characters, words, lines, sentences and UTF-8 bytes',
    tr: 'Karakter, kelime, satır, cümle ve UTF-8 bayt sayısı',
  },
  keywords: ['count', 'length', 'words', 'characters', 'bytes', 'wc', 'say', 'kelime', 'karakter', 'uzunluk'],
  layout: 'table',
  options: [{ key: 'lang', type: 'segmented', values: ['auto', 'tr', 'en'], default: 'auto', hotkey: 'l' }],
  run(input, opts, ctx) {
    const c = countText(input, resolveLang(opts.lang, input, ctx.locale));
    const nf = new Intl.NumberFormat(ctx.locale === 'tr' ? 'tr-TR' : 'en-US');
    const row = (key: keyof TextCounts) => [ctx.t(`tool.count.${key}`), nf.format(c[key])];
    const readingMs = Math.round((c.words / WORDS_PER_MINUTE) * 60) * 1000;
    const rows = [
      row('characters'),
      row('codePoints'),
      row('utf16'),
      row('bytes'),
      row('words'),
      row('lines'),
      row('nonEmptyLines'),
      row('sentences'),
      row('paragraphs'),
      row('whitespace'),
      [ctx.t('tool.count.readingTime'), shortDuration(readingMs, ctx.locale)],
    ];
    return {
      output: { columns: [ctx.t('tool.count.metric'), ctx.t('tool.count.value')], rows },
      meta: { characters: c.characters, words: c.words, lines: c.lines, bytes: c.bytes },
    };
  },
  examples: [
    {
      input: "Iğdır'da ılık bir gün.",
      output:
        'Metric           Count\n───────────────  ─────\nCharacters       22\nCode points      22\nUTF-16 units     22\nUTF-8 bytes      27\nWords            4\nLines            1\nNon-empty lines  1\nSentences        1\nParagraphs       1\nWhitespace       3\nReading time     1s',
    },
    {
      input: 'a\nb\n\nc',
      output:
        'Metric           Count\n───────────────  ─────\nCharacters       6\nCode points      6\nUTF-16 units     6\nUTF-8 bytes      6\nWords            3\nLines            4\nNon-empty lines  3\nSentences        3\nParagraphs       2\nWhitespace       3\nReading time     1s',
    },
    {
      input: '👍🏽 ok',
      output:
        'Metric           Count\n───────────────  ─────\nCharacters       4\nCode points      5\nUTF-16 units     7\nUTF-8 bytes      11\nWords            1\nLines            1\nNon-empty lines  1\nSentences        1\nParagraphs       1\nWhitespace       1\nReading time     0s',
    },
  ],
});
