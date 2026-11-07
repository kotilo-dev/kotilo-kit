import { defineTool, type RunContext } from '@kotilo/kit-core';
import { utf8Encode } from '../_lib/bytes.js';

type Norm = 'none' | 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
type Opts = { normalize: Norm };

const MAX_ROWS = 2000;

const CATEGORIES = [
  'Lu', 'Ll', 'Lt', 'Lm', 'Lo', 'Mn', 'Mc', 'Me', 'Nd', 'Nl', 'No', 'Pc', 'Pd', 'Ps', 'Pe', 'Pi', 'Pf', 'Po',
  'Sm', 'Sc', 'Sk', 'So', 'Zs', 'Zl', 'Zp', 'Cc', 'Cf', 'Cs', 'Co', 'Cn',
] as const;
const CATEGORY_RES = CATEGORIES.map((c) => [c, new RegExp(`^\\p{gc=${c}}$`, 'u')] as const);

export function generalCategory(ch: string): string {
  for (const [c, re] of CATEGORY_RES) if (re.test(ch)) return c;
  return 'Cn';
}

type Flag = 'invisible' | 'bidi' | 'turkish' | 'control';

/** Characters worth flagging, with their Unicode names and a short visible placeholder. */
const SPECIAL = new Map<number, [Flag, string, string]>([
  [0x00a0, ['invisible', 'NO-BREAK SPACE', 'NBSP']],
  [0x00ad, ['invisible', 'SOFT HYPHEN', 'SHY']],
  [0x034f, ['invisible', 'COMBINING GRAPHEME JOINER', 'CGJ']],
  [0x115f, ['invisible', 'HANGUL CHOSEONG FILLER', 'HCF']],
  [0x1160, ['invisible', 'HANGUL JUNGSEONG FILLER', 'HJF']],
  [0x180e, ['invisible', 'MONGOLIAN VOWEL SEPARATOR', 'MVS']],
  [0x2007, ['invisible', 'FIGURE SPACE', 'FSP']],
  [0x200b, ['invisible', 'ZERO WIDTH SPACE', 'ZWSP']],
  [0x200c, ['invisible', 'ZERO WIDTH NON-JOINER', 'ZWNJ']],
  [0x200d, ['invisible', 'ZERO WIDTH JOINER', 'ZWJ']],
  [0x202f, ['invisible', 'NARROW NO-BREAK SPACE', 'NNBSP']],
  [0x2060, ['invisible', 'WORD JOINER', 'WJ']],
  [0x2061, ['invisible', 'FUNCTION APPLICATION', 'FA']],
  [0x2062, ['invisible', 'INVISIBLE TIMES', 'IT']],
  [0x2063, ['invisible', 'INVISIBLE SEPARATOR', 'IS']],
  [0x2064, ['invisible', 'INVISIBLE PLUS', 'IP']],
  [0x3164, ['invisible', 'HANGUL FILLER', 'HF']],
  [0xfeff, ['invisible', 'ZERO WIDTH NO-BREAK SPACE (BOM)', 'BOM']],
  [0x061c, ['bidi', 'ARABIC LETTER MARK', 'ALM']],
  [0x200e, ['bidi', 'LEFT-TO-RIGHT MARK', 'LRM']],
  [0x200f, ['bidi', 'RIGHT-TO-LEFT MARK', 'RLM']],
  [0x202a, ['bidi', 'LEFT-TO-RIGHT EMBEDDING', 'LRE']],
  [0x202b, ['bidi', 'RIGHT-TO-LEFT EMBEDDING', 'RLE']],
  [0x202c, ['bidi', 'POP DIRECTIONAL FORMATTING', 'PDF']],
  [0x202d, ['bidi', 'LEFT-TO-RIGHT OVERRIDE', 'LRO']],
  [0x202e, ['bidi', 'RIGHT-TO-LEFT OVERRIDE', 'RLO']],
  [0x2066, ['bidi', 'LEFT-TO-RIGHT ISOLATE', 'LRI']],
  [0x2067, ['bidi', 'RIGHT-TO-LEFT ISOLATE', 'RLI']],
  [0x2068, ['bidi', 'FIRST STRONG ISOLATE', 'FSI']],
  [0x2069, ['bidi', 'POP DIRECTIONAL ISOLATE', 'PDI']],
  [0x0130, ['turkish', 'LATIN CAPITAL LETTER I WITH DOT ABOVE', '']],
  [0x0131, ['turkish', 'LATIN SMALL LETTER DOTLESS I', '']],
]);

/** Common Cyrillic / Greek letters that look like Latin ones. */
const CONFUSABLE: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', һ: 'h', ԁ: 'd',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', І: 'I', Ј: 'J', Ѕ: 'S',
  ο: 'o', ν: 'v', α: 'a', ι: 'i', Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O',
  Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
};

const hex4 = (cp: number) => cp.toString(16).toUpperCase().padStart(4, '0');

/** A visible stand-in for characters that would render as nothing. */
function display(ch: string, cp: number, cat: string): string {
  const special = SPECIAL.get(cp);
  if (special && special[2]) return `[${special[2]}]`;
  if (cp < 0x20) return String.fromCodePoint(0x2400 + cp); // control pictures ␀..␟
  if (cp === 0x7f) return '␡';
  if (cp === 0x20) return '␠';
  if (cat === 'Mn' || cat === 'Me') return `◌${ch}`;
  if (cat === 'Zs' || cat === 'Zl' || cat === 'Zp' || cat === 'Cf' || cat === 'Cc') return `[U+${hex4(cp)}]`;
  if (cat === 'Cs') return '[?]';
  return ch;
}

function note(ch: string, cp: number, cat: string, ctx: RunContext): { text: string; hidden: boolean } {
  const special = SPECIAL.get(cp);
  if (special) {
    const [flag, name] = special;
    return { text: `${ctx.t(`tool.unicode.flag.${flag}`)} · ${name}`, hidden: flag !== 'turkish' };
  }
  if (cat === 'Cc' && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return { text: ctx.t('tool.unicode.flag.control'), hidden: true };
  if (cat === 'Cf') return { text: ctx.t('tool.unicode.flag.format'), hidden: true };
  if (cat === 'Cs') return { text: ctx.t('tool.unicode.flag.surrogate'), hidden: false };
  const latin = CONFUSABLE[ch];
  if (latin) return { text: ctx.t('tool.unicode.flag.confusable', { latin }), hidden: false };
  return { text: '', hidden: false };
}

const HIDDEN_RE = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

export default defineTool<Opts>({
  id: 'unicode',
  category: 'encoding',
  name: { en: 'Unicode inspector', tr: 'Unicode inceleme' },
  description: {
    en: 'Code points, categories, UTF-8 bytes and hidden characters',
    tr: 'Kod noktaları, kategoriler, UTF-8 baytları ve görünmez karakterler',
  },
  keywords: ['unicode', 'codepoint', 'utf-8', 'zero width', 'bidi', 'nfc', 'nfd', 'görünmez', 'karakter'],
  layout: 'table',
  // only when the text hides zero-width / bidi / BOM characters
  detect: (input) => (input.length <= 100_000 && HIDDEN_RE.test(input) ? 0.55 : 0),
  options: [
    { key: 'normalize', type: 'select', values: ['none', 'NFC', 'NFD', 'NFKC', 'NFKD'], default: 'none', hotkey: 'n' },
  ],
  run(input, opts, ctx) {
    const text = opts.normalize === 'none' ? input : input.normalize(opts.normalize);
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
    const rows: string[][] = [];
    let codePoints = 0;
    let invisible = 0;
    for (const { segment } of graphemes) {
      for (const ch of segment) {
        const cp = ch.codePointAt(0)!;
        const cat = generalCategory(ch);
        const n = note(ch, cp, cat, ctx);
        codePoints++;
        if (n.hidden) invisible++;
        if (rows.length >= MAX_ROWS) continue;
        const bytes = [...utf8Encode(ch)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        rows.push([display(ch, cp, cat), `U+${hex4(cp)}`, cat, bytes, n.text]);
      }
    }
    if (codePoints > MAX_ROWS) rows.push(['…', '', '', '', ctx.t('tool.unicode.truncated', { shown: MAX_ROWS, total: codePoints })]);
    const columns = ['char', 'codePoint', 'category', 'utf8', 'note'].map((k) => ctx.t(`tool.unicode.col.${k}`));
    return {
      output: { columns, rows },
      meta: { codePoints, graphemes: graphemes.length, invisible, utf8Bytes: utf8Encode(text).length },
    };
  },
  examples: [
    {
      input: 'Iı',
      output:
        'Char  Code point  Category  UTF-8  Note\n────  ──────────  ────────  ─────  ──────────────────────────────────────\nI     U+0049      Lu        49\nı     U+0131      Ll        C4 B1  Turkish · LATIN SMALL LETTER DOTLESS I',
    },
    {
      input: 'a\u200bb',
      output:
        'Char    Code point  Category  UTF-8     Note\n──────  ──────────  ────────  ────────  ────────────────────────────\na       U+0061      Ll        61\n[ZWSP]  U+200B      Cf        E2 80 8B  Invisible · ZERO WIDTH SPACE\nb       U+0062      Ll        62',
    },
    {
      input: 'é',
      opts: { normalize: 'NFD' },
      output:
        'Char  Code point  Category  UTF-8  Note\n────  ──────────  ────────  ─────  ────\ne     U+0065      Ll        65\n◌́    U+0301      Mn        CC 81',
    },
  ],
});
