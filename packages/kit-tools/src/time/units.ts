import { defineTool, fail, type RunContext } from '@kotilo/kit-core';

type Opts = { bytes: 'si' | 'iec' };

const BASE_RE = /^([+-])?0([xob])([0-9a-f]+)$/i;
const INT_RE = /^([+-])?(\d+)$/;
const QTY_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([\p{L}]+)$/iu;

const SI = [
  ['KB', 1e3],
  ['MB', 1e6],
  ['GB', 1e9],
  ['TB', 1e12],
] as const;
const IEC = [
  ['KiB', 2 ** 10],
  ['MiB', 2 ** 20],
  ['GiB', 2 ** 30],
  ['TiB', 2 ** 40],
] as const;

/** Byte units, matched case-insensitively ("mb" = MB; bits are not supported). */
const BYTE_UNITS = new Map<string, number>([
  ['b', 1],
  ['byte', 1],
  ['bytes', 1],
  ['bayt', 1],
  ['kb', 1e3],
  ['mb', 1e6],
  ['gb', 1e9],
  ['tb', 1e12],
  ['pb', 1e15],
  ['kib', 2 ** 10],
  ['mib', 2 ** 20],
  ['gib', 2 ** 30],
  ['tib', 2 ** 40],
  ['pib', 2 ** 50],
]);

const TIME_ROWS = [
  ['ms', 1],
  ['s', 1000],
  ['min', 60_000],
  ['h', 3_600_000],
  ['d', 86_400_000],
  ['w', 604_800_000],
] as const;

const TIME_UNITS = new Map<string, number>([
  ['ms', 1],
  ['s', 1000],
  ['sec', 1000],
  ['secs', 1000],
  ['second', 1000],
  ['seconds', 1000],
  ['sn', 1000],
  ['saniye', 1000],
  ['m', 60_000],
  ['min', 60_000],
  ['mins', 60_000],
  ['minute', 60_000],
  ['minutes', 60_000],
  ['dk', 60_000],
  ['dakika', 60_000],
  ['h', 3_600_000],
  ['hr', 3_600_000],
  ['hrs', 3_600_000],
  ['hour', 3_600_000],
  ['hours', 3_600_000],
  ['sa', 3_600_000],
  ['saat', 3_600_000],
  ['d', 86_400_000],
  ['day', 86_400_000],
  ['days', 86_400_000],
  ['g', 86_400_000],
  ['gün', 86_400_000],
  ['w', 604_800_000],
  ['wk', 604_800_000],
  ['week', 604_800_000],
  ['weeks', 604_800_000],
  ['hafta', 604_800_000],
]);

const DETECT_BYTES_RE = /^\d+(?:[.,]\d+)?\s*(?:[KMGTP]i?B|bytes?)$/i;

/** Accept `1,5` as a decimal comma and `_` as a digit separator. */
function normalize(input: string): string {
  let s = input.trim().replace(/_/g, '');
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  return s;
}

function baseTable(n: bigint, ctx: RunContext) {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const sign = neg ? '-' : '';
  const row = (key: string, value: string) => [ctx.t(`tool.units.${key}`), value];
  const rows = [
    row('dec', `${sign}${abs.toString(10)}`),
    row('hex', `${sign}0x${abs.toString(16)}`),
    row('oct', `${sign}0o${abs.toString(8)}`),
    row('bin', `${sign}0b${abs.toString(2)}`),
    row('bits', new Intl.NumberFormat(ctx.locale === 'tr' ? 'tr-TR' : 'en-US').format(abs === 0n ? 1 : abs.toString(2).length)),
  ];
  return { output: { columns: [ctx.t('tool.units.unit'), ctx.t('tool.units.value')], rows }, meta: { kind: 'base' } };
}

function formatter(ctx: RunContext) {
  const lang = ctx.locale === 'tr' ? 'tr-TR' : 'en-US';
  const plain = new Intl.NumberFormat(lang, { maximumFractionDigits: 3 });
  const small = new Intl.NumberFormat(lang, { maximumSignificantDigits: 4 });
  return (x: number) => (x === 0 || Math.abs(x) >= 1 ? plain.format(x) : small.format(x));
}

export default defineTool<Opts>({
  id: 'units',
  category: 'time',
  name: { en: 'Number bases & units', tr: 'Sayı tabanı ve birim' },
  description: {
    en: 'Hex/oct/bin/dec, byte sizes KB ⇄ MiB, time units',
    tr: 'Hex/oct/bin/dec, bayt boyutu KB ⇄ MiB, zaman birimleri',
  },
  keywords: ['hex', 'binary', 'octal', 'decimal', 'base', 'bytes', 'kb', 'mib', 'gb', 'units', 'taban', 'birim', 'bayt'],
  layout: 'table',
  detect(input) {
    const s = input.trim();
    if (/^[+-]?0x[0-9a-f_]+$/i.test(s) || /^[+-]?0b[01_]+$/i.test(s)) return 0.7;
    if (/^[+-]?0o[0-7_]+$/i.test(s)) return 0.6;
    if (DETECT_BYTES_RE.test(s)) return 0.6;
    return 0;
  },
  options: [{ key: 'bytes', type: 'segmented', values: ['si', 'iec'], default: 'si', hotkey: 'b' }],
  run(input, opts, ctx) {
    const s = normalize(input);
    if (!s) return { output: { columns: [ctx.t('tool.units.unit'), ctx.t('tool.units.value')], rows: [] }, meta: { kind: 'empty' } };

    const based = BASE_RE.exec(s);
    if (based) {
      const [, sign, prefix, digits] = based;
      const DIGITS = { x: /^[0-9a-f]+$/i, o: /^[0-7]+$/, b: /^[01]+$/ } as const;
      const valid = DIGITS[prefix!.toLowerCase() as keyof typeof DIGITS].test(digits!);
      if (!valid) fail('error.units.invalid', { input: input.trim().slice(0, 40) });
      const abs = BigInt(`0${prefix}${digits}`);
      return baseTable(sign === '-' ? -abs : abs, ctx);
    }
    const int = INT_RE.exec(s);
    if (int) return baseTable(BigInt(`${int[1] ?? ''}${int[2]}`), ctx);

    const qty = QTY_RE.exec(s);
    if (qty) {
      const value = Number(qty[1]);
      const unit = qty[2]!;
      const fmt = formatter(ctx);
      const columns = [ctx.t('tool.units.unit'), ctx.t('tool.units.value')];
      const byteMul = BYTE_UNITS.get(unit.toLowerCase());
      if (byteMul !== undefined) {
        const bytes = value * byteMul;
        const families = opts.bytes === 'iec' ? [IEC, SI] : [SI, IEC];
        const rows = [['B', fmt(bytes)], ...families.flatMap((f) => f.map(([name, size]) => [name, fmt(bytes / size)]))];
        return { output: { columns, rows }, meta: { kind: 'bytes', bytes } };
      }
      const timeMul = TIME_UNITS.get(unit.toLocaleLowerCase('tr-TR')) ?? TIME_UNITS.get(unit.toLowerCase());
      if (timeMul !== undefined) {
        const ms = value * timeMul;
        const rows = TIME_ROWS.map(([key, size]) => [ctx.t(`tool.units.time.${key}`), fmt(ms / size)]);
        return { output: { columns, rows }, meta: { kind: 'time', ms } };
      }
      fail('error.units.unit', { unit });
    }
    return fail('error.units.invalid', { input: input.trim().slice(0, 40) });
  },
  examples: [
    {
      input: '0x1F',
      output: 'Unit         Value\n───────────  ───────\nDecimal      31\nHexadecimal  0x1f\nOctal        0o37\nBinary       0b11111\nBit length   5',
    },
    {
      input: '512MiB',
      opts: { bytes: 'iec' },
      output:
        'Unit  Value\n────  ───────────\nB     536,870,912\nKiB   524,288\nMiB   512\nGiB   0.5\nTiB   0.0004883\nKB    536,870.912\nMB    536.871\nGB    0.5369\nTB    0.0005369',
    },
    {
      input: '90 min',
      output:
        'Unit          Value\n────────────  ─────────\nMilliseconds  5,400,000\nSeconds       5,400\nMinutes       90\nHours         1.5\nDays          0.0625\nWeeks         0.008929',
    },
  ],
});
