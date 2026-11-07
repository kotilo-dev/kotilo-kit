import { defineTool } from '@kotilo/kit-core';

type Opts = { mode: 'encode' | 'decode'; nonAscii: boolean };

/** HTML 4 Latin-1 names, U+00A0..U+00FF in order. */
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml';

const EXTRA: Record<string, number> = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27,
  // Turkish letters outside Latin-1 (HTML5 names)
  Gbreve: 0x11e, gbreve: 0x11f, Idot: 0x130, imath: 0x131, inodot: 0x131, Scedil: 0x15e, scedil: 0x15f,
  OElig: 0x152, oelig: 0x153, Scaron: 0x160, scaron: 0x161, Yuml: 0x178, fnof: 0x192, circ: 0x2c6, tilde: 0x2dc,
  ensp: 0x2002, emsp: 0x2003, thinsp: 0x2009, zwnj: 0x200c, zwj: 0x200d, lrm: 0x200e, rlm: 0x200f,
  ndash: 0x2013, mdash: 0x2014, lsquo: 0x2018, rsquo: 0x2019, sbquo: 0x201a, ldquo: 0x201c, rdquo: 0x201d, bdquo: 0x201e,
  dagger: 0x2020, Dagger: 0x2021, bull: 0x2022, hellip: 0x2026, permil: 0x2030, prime: 0x2032, Prime: 0x2033,
  lsaquo: 0x2039, rsaquo: 0x203a, euro: 0x20ac, trade: 0x2122,
  larr: 0x2190, uarr: 0x2191, rarr: 0x2192, darr: 0x2193, harr: 0x2194, lArr: 0x21d0, rArr: 0x21d2, hArr: 0x21d4,
  minus: 0x2212, radic: 0x221a, infin: 0x221e, sum: 0x2211, asymp: 0x2248, ne: 0x2260, equiv: 0x2261, le: 0x2264, ge: 0x2265,
  alpha: 0x3b1, beta: 0x3b2, gamma: 0x3b3, delta: 0x3b4, pi: 0x3c0, sigma: 0x3c3, mu: 0x3bc, omega: 0x3c9,
  Delta: 0x394, Sigma: 0x3a3, Omega: 0x3a9,
  spades: 0x2660, clubs: 0x2663, hearts: 0x2665, diams: 0x2666, check: 0x2713,
};

const NAMED = new Map<string, number>(Object.entries(EXTRA));
LATIN1.split(' ').forEach((name, i) => NAMED.set(name, 0xa0 + i));

/** HTML spec: numeric refs 0x80..0x9F are read as Windows-1252. */
const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6,
  0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039, 0x8c: 0x152, 0x8e: 0x17d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161, 0x9b: 0x203a,
  0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178,
};

const REF_RE = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g;

function numeric(ref: string): string {
  let cp = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
  cp = CP1252[cp] ?? cp;
  if (!Number.isFinite(cp) || cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
  return String.fromCodePoint(cp);
}

export function decodeEntities(input: string): { text: string; count: number } {
  let count = 0;
  const text = input.replace(REF_RE, (whole, ref: string) => {
    if (ref.startsWith('#')) {
      count++;
      return numeric(ref);
    }
    const cp = NAMED.get(ref);
    if (cp === undefined) return whole; // unknown named entity: leave as-is
    count++;
    return String.fromCodePoint(cp);
  });
  return { text, count };
}

const BASIC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function encodeEntities(input: string, nonAscii: boolean): string {
  const basic = input.replace(/[&<>"']/g, (c) => BASIC[c]!);
  if (!nonAscii) return basic;
  return basic.replace(/[\u0080-\u{10FFFF}]/gu, (c) => `&#x${c.codePointAt(0)!.toString(16).toUpperCase()};`);
}

function detect(input: string): number {
  const s = input.trim();
  if (!s || s.length > 1_000_000) return 0;
  let known = 0;
  for (const m of s.matchAll(REF_RE)) {
    const ref = m[1]!;
    if (ref.startsWith('#') || NAMED.has(ref)) known++;
    if (known >= 2) break;
  }
  return known >= 2 ? 0.7 : known === 1 ? 0.5 : 0;
}

export default defineTool<Opts>({
  id: 'html-entity',
  category: 'encoding',
  name: { en: 'HTML entities', tr: 'HTML entity' },
  description: { en: 'Encode or decode HTML entities', tr: 'HTML entity kodla veya çöz' },
  keywords: ['html', 'entity', 'escape', 'unescape', '&amp;', 'kodla', 'çöz'],
  detect,
  options: [
    { key: 'mode', type: 'segmented', values: ['encode', 'decode'], default: 'encode', hotkey: 'm' },
    { key: 'nonAscii', type: 'toggle', default: false, hotkey: 'a' },
  ],
  run(input, opts) {
    if (opts.mode === 'encode') return { output: encodeEntities(input, opts.nonAscii) };
    const { text, count } = decodeEntities(input);
    return { output: text, meta: { entities: count } };
  },
  examples: [
    { input: '<a href="x">Tom & Jerry</a>', opts: { mode: 'encode' }, output: '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;' },
    { input: 'Çay & şeker', opts: { mode: 'encode', nonAscii: true }, output: '&#xC7;ay &amp; &#x15F;eker' },
    { input: '&copy; 2026 &mdash; it&#39;s &#x1F600; &bogus;', opts: { mode: 'decode' }, output: '© 2026 — it\'s 😀 &bogus;' },
  ],
});
