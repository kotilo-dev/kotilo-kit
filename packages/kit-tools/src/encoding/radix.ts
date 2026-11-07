import { defineTool, fail } from '@kotilo/kit-core';
import { base64Encode, utf8DecodeStrict, utf8Encode } from '../_lib/bytes.js';

type From = 'auto' | 'text' | 'hex' | 'binary' | 'decimal';
type Opts = { from: From };

const BINARY_RE = /^(?:0b)?[01]{8}(?:\s+(?:0b)?[01]{8})*$/i;
const BINARY_COMPACT_RE = /^(?:[01]{8})+$/;
const HEX_PAIRS_RE = /^(?:0x|\\x)?[0-9a-f]{2}(?:[\s:,-]+(?:0x|\\x)?[0-9a-f]{2})*$/i;
const HEX_PREFIXED_RE = /^(?:0x|\\x)[0-9a-f\s]+$/i;
const DECIMAL_RE = /^\d{1,3}(?:[\s,]+\d{1,3})+$/;

/** Guess the input format. Order matters: binary, decimal, hex, text. */
export function guessFormat(input: string): Exclude<From, 'auto'> {
  const s = input.trim();
  if (!s) return 'text';
  if (BINARY_RE.test(s) || (s.length >= 16 && BINARY_COMPACT_RE.test(s))) return 'binary';
  if (DECIMAL_RE.test(s)) {
    const tokens = s.split(/[\s,]+/);
    // "48 69" — every token exactly two digits reads more naturally as hex pairs
    const allPairs = tokens.every((t) => t.length === 2);
    if (!allPairs && tokens.every((t) => Number(t) <= 255)) return 'decimal';
  }
  if (HEX_PAIRS_RE.test(s) || HEX_PREFIXED_RE.test(s)) return 'hex';
  if (/^[0-9a-f]+$/i.test(s) && s.length % 2 === 0 && (/\d/.test(s) || s.length >= 8)) return 'hex';
  return 'text';
}

function parseHex(input: string): Uint8Array {
  const compact = input.replace(/0x|\\x/gi, '').replace(/[\s:,-]+/g, '');
  const bad = compact.search(/[^0-9a-f]/i);
  if (bad >= 0) fail('error.radix.invalidHex', { char: compact[bad]! });
  if (compact.length % 2 !== 0) fail('error.radix.hexOdd', { digits: compact.length });
  const out = new Uint8Array(compact.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(compact.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function parseBinary(input: string): Uint8Array {
  const tokens = input.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/^0b/i, ''));
  const out: number[] = [];
  for (const t of tokens) {
    if (!/^[01]+$/.test(t) || t.length % 8 !== 0) fail('error.radix.invalidBinary', { group: t });
    for (let i = 0; i < t.length; i += 8) out.push(parseInt(t.slice(i, i + 8), 2));
  }
  return Uint8Array.from(out);
}

function parseDecimal(input: string): Uint8Array {
  const tokens = input.trim().split(/[\s,]+/).filter(Boolean);
  return Uint8Array.from(
    tokens.map((t) => {
      const n = /^\d+$/.test(t) ? Number(t) : NaN;
      if (!(n >= 0 && n <= 255)) fail('error.radix.invalidDecimal', { value: t });
      return n;
    }),
  );
}

const bin = (b: number) => b.toString(2).padStart(8, '0');
const hex = (b: number) => b.toString(16).padStart(2, '0');

function detect(input: string): number {
  const s = input.trim();
  if (s.length > 100_000) return 0;
  // whitespace-separated 8-bit groups: "01001000 01101001"
  if (/^[01]{8}(?:\s+[01]{8})+$/.test(s)) return 0.6;
  // spaced hex byte pairs with at least one letter: "48 65 6c 6c 6f" — kept low
  if (/^[0-9a-f]{2}(?:[ :][0-9a-f]{2}){3,}$/i.test(s) && /[a-f]/i.test(s)) return 0.3;
  return 0;
}

export default defineTool<Opts>({
  id: 'radix',
  category: 'encoding',
  name: { en: 'Hex / text / binary', tr: 'Hex / metin / ikili' },
  description: {
    en: 'Convert bytes between text, hex, binary, decimal and Base64',
    tr: 'Baytları metin, hex, ikili, ondalık ve Base64 arasında dönüştür',
  },
  keywords: ['hex', 'binary', 'decimal', 'bytes', 'ascii', 'ikili', 'ondalık', 'bayt', 'onaltılık'],
  layout: 'table',
  detect,
  options: [
    { key: 'from', type: 'select', values: ['auto', 'text', 'hex', 'binary', 'decimal'], default: 'auto', hotkey: 'f' },
  ],
  run(input, opts, ctx) {
    const from = opts.from === 'auto' ? guessFormat(input) : opts.from;
    let bytes: Uint8Array;
    if (from === 'text') bytes = ctx.bytes ?? utf8Encode(input);
    else if (from === 'hex') bytes = parseHex(input);
    else if (from === 'binary') bytes = parseBinary(input);
    else bytes = parseDecimal(input);

    const strict = utf8DecodeStrict(bytes);
    const text = strict ?? new TextDecoder('utf-8').decode(bytes);
    const arr = [...bytes];
    const rows: string[][] = [
      [ctx.t('tool.radix.row.text'), text],
      [ctx.t('tool.radix.row.hex'), arr.map(hex).join(' ')],
      [ctx.t('tool.radix.row.binary'), arr.map(bin).join(' ')],
      [ctx.t('tool.radix.row.decimal'), arr.join(' ')],
      [ctx.t('tool.radix.row.base64'), base64Encode(bytes)],
    ];
    if (strict === null) rows.push([ctx.t('tool.radix.row.note'), ctx.t('tool.radix.invalidUtf8')]);
    return {
      output: { columns: [ctx.t('tool.radix.format'), ctx.t('tool.radix.value')], rows },
      meta: { bytes: bytes.length, from, validUtf8: strict !== null },
    };
  },
  examples: [
    {
      input: 'Hi',
      output:
        'Format        Value\n────────────  ─────────────────\nText (UTF-8)  Hi\nHex           48 69\nBinary        01001000 01101001\nDecimal       72 105\nBase64        SGk=',
    },
    {
      input: '01001000 01101001',
      output:
        'Format        Value\n────────────  ─────────────────\nText (UTF-8)  Hi\nHex           48 69\nBinary        01001000 01101001\nDecimal       72 105\nBase64        SGk=',
    },
    {
      input: '0xc4b0',
      output:
        'Format        Value\n────────────  ─────────────────\nText (UTF-8)  İ\nHex           c4 b0\nBinary        11000100 10110000\nDecimal       196 176\nBase64        xLA=',
    },
  ],
});
