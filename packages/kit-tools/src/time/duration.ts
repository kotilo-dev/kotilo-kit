import { defineTool, fail, type Locale, type RunContext } from '@kotilo/kit-core';
import { isoInZone } from '../_lib/date.js';
import { splitLines } from '../_lib/text.js';

type Mode = 'between' | 'add' | 'convert';
type Opts = { mode: Mode; amount: string };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;
const SECOND = 1000;
/** Fixed lengths used only when converting a duration that contains years or months. */
const YEAR_DAYS = 365;
const MONTH_DAYS = 30;

const ISO_DURATION_RE =
  /^([+-])?P(?=\d|T\d)(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?=\d)(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i;

// ---------- durations ----------

/** Signed components; calendar parts (years, months) stay separate from fixed-length ones. */
export interface Parts {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  ms: number;
}

const emptyParts = (): Parts => ({ years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, ms: 0 });

const UNIT_ALIASES: Record<keyof Parts, readonly string[]> = {
  years: ['y', 'yr', 'yrs', 'year', 'years', 'yıl', 'sene'],
  months: ['mo', 'mos', 'mon', 'month', 'months', 'ay'],
  weeks: ['w', 'wk', 'wks', 'week', 'weeks', 'hf', 'hafta'],
  days: ['d', 'day', 'days', 'g', 'gün'],
  hours: ['h', 'hr', 'hrs', 'hour', 'hours', 'sa', 'saat'],
  minutes: ['m', 'min', 'mins', 'minute', 'minutes', 'dk', 'dakika'],
  seconds: ['s', 'sec', 'secs', 'second', 'seconds', 'sn', 'saniye'],
  ms: ['ms', 'msec', 'millisecond', 'milliseconds'],
};
const UNIT_OF = new Map<string, keyof Parts>();
for (const [k, list] of Object.entries(UNIT_ALIASES)) for (const a of list) UNIT_OF.set(a, k as keyof Parts);

const num = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : 0);

/** `+3d 4h`, `-2w`, `1y2mo`, `90061` (seconds), `1 gün 2 saat` or ISO 8601 `P1DT2H`. Null when unparsable. */
export function parseDuration(text: string): Parts | null {
  const s = text.trim();
  if (!s) return null;
  const iso = ISO_DURATION_RE.exec(s);
  if (iso) {
    const sign = iso[1] === '-' ? -1 : 1;
    const [, , y, mo, w, d, h, mi, sec] = iso;
    return {
      years: sign * num(y),
      months: sign * num(mo),
      weeks: sign * num(w),
      days: sign * num(d),
      hours: sign * num(h),
      minutes: sign * num(mi),
      seconds: sign * num(sec),
      ms: 0,
    };
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) return { ...emptyParts(), seconds: Number(s) };

  const parts = emptyParts();
  const token = /([+-]?)\s*(\d+(?:[.,]\d+)?)\s*([\p{L}]+)/uy;
  let sign = 1;
  let pos = 0;
  let found = false;
  while (pos < s.length) {
    const skip = /[\s,]*/y;
    skip.lastIndex = pos;
    skip.exec(s);
    pos = skip.lastIndex;
    if (pos >= s.length) break;
    token.lastIndex = pos;
    const m = token.exec(s);
    if (!m) return null;
    const unit = UNIT_OF.get(m[3]!.toLocaleLowerCase('tr-TR')) ?? UNIT_OF.get(m[3]!.toLowerCase());
    if (!unit) return null;
    if (m[1]) sign = m[1] === '-' ? -1 : 1; // an unsigned token keeps the previous sign: "-1d 2h" = -(1d 2h)
    parts[unit] += sign * num(m[2]);
    pos = token.lastIndex;
    found = true;
  }
  return found ? parts : null;
}

/** Total milliseconds; years and months use fixed 365/30-day lengths. */
export function partsToMs(p: Parts): number {
  return (
    (p.years * YEAR_DAYS + p.months * MONTH_DAYS + p.weeks * 7 + p.days) * DAY +
    p.hours * HOUR +
    p.minutes * MINUTE +
    p.seconds * SECOND +
    p.ms
  );
}

const trimNum = (n: number) => String(Math.round(n * 1000) / 1000);

/** `P1DT1H1M1S`; days are the largest unit so the value is exact. */
export function isoDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  let rest = Math.abs(ms);
  const d = Math.floor(rest / DAY);
  rest -= d * DAY;
  const h = Math.floor(rest / HOUR);
  rest -= h * HOUR;
  const m = Math.floor(rest / MINUTE);
  rest -= m * MINUTE;
  const s = rest / SECOND;
  let out = `${sign}P${d ? `${d}D` : ''}`;
  const time = `${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s ? `${trimNum(s)}S` : ''}`;
  if (time) out += `T${time}`;
  return out === `${sign}P` ? 'PT0S' : out;
}

/**
 * "1 yr 2 mth 3 days 4 hr" / "1 yıl 2 ay 3 gün 4 sa." — per-unit Intl.NumberFormat.
 * Not Intl.DurationFormat: it is missing in Node 22 and some webviews, and output must not depend on the engine.
 */
type HumanUnit = 'years' | 'months' | 'days' | 'hours' | 'minutes' | 'seconds' | 'milliseconds';
function humanParts(p: Partial<Record<HumanUnit, number>>, locale: Locale): string {
  const lang = locale === 'tr' ? 'tr-TR' : 'en-US';
  const entries = Object.entries(p).filter(([, v]) => v);
  if (entries.length === 0) {
    return new Intl.NumberFormat(lang, { style: 'unit', unit: 'second', unitDisplay: 'short' }).format(0);
  }
  return entries
    .map(([u, v]) => new Intl.NumberFormat(lang, { style: 'unit', unit: u.replace(/s$/, ''), unitDisplay: 'short' }).format(v))
    .join(' ');
}

// ---------- dates ----------

/** Offset (ms) of `tz` at the instant `ms`. */
function tzOffset(ms: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>;
  const wall = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return wall - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in `tz` as a naive UTC timestamp (calendar math happens in this space). */
const toWall = (ms: number, tz: string) => ms + tzOffset(ms, tz);

/** Naive wall-clock timestamp in `tz` → real instant. */
function fromWall(wall: number, tz: string): number {
  let ms = wall - tzOffset(wall, tz);
  ms = wall - tzOffset(ms, tz);
  return ms;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/;
const TR_DATE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const ZONED_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i;

function validWall(y: number, mo: number, d: number, h: number, mi: number, s: number): number | null {
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const back = new Date(wall);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  return wall;
}

/** ISO (with or without offset), `YYYY-MM-DD`, `DD.MM.YYYY [HH:MM]`, Unix seconds, `now`/`şimdi` or empty. */
export function parseDate(text: string, ctx: RunContext): number {
  const s = text.trim();
  const low = s.toLocaleLowerCase('tr-TR');
  if (!s || low === 'now' || low === 'şimdi') return ctx.now.getTime();
  if (/^-?\d{1,11}$/.test(s)) return Number(s) * 1000;
  let m = LOCAL_RE.exec(s);
  if (m) {
    const wall = validWall(+m[1]!, +m[2]!, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    if (wall !== null) return fromWall(wall + Number((m[7] ?? '').padEnd(3, '0')), ctx.tz);
  }
  m = TR_DATE_RE.exec(s);
  if (m) {
    const wall = validWall(+m[3]!, +m[2]!, +m[1]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    if (wall !== null) return fromWall(wall, ctx.tz);
  }
  if (ZONED_RE.test(s)) {
    const ms = Date.parse(s.replace(' ', 'T').replace(/\s+/, ''));
    if (!Number.isNaN(ms)) return ms;
  }
  return fail('error.duration.date', { input: s.slice(0, 40) });
}

/** Add calendar months to a naive wall timestamp, clamping the day (Jan 31 + 1 mo = Feb 28/29). */
function addMonths(wall: number, months: number): number {
  const d = new Date(wall);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + months;
  const target = Date.UTC(y, mo, 1);
  const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const t = new Date(target);
  return Date.UTC(
    t.getUTCFullYear(),
    t.getUTCMonth(),
    Math.min(d.getUTCDate(), dim),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

/** Mon–Fri days in [fromDay, toDay), days counted from the Unix epoch (a Thursday). */
function businessDays(fromDay: number, toDay: number): number {
  const n = toDay - fromDay;
  let count = Math.floor(n / 7) * 5;
  for (let day = fromDay + Math.floor(n / 7) * 7; day < toDay; day++) {
    const dow = (((day + 4) % 7) + 7) % 7; // 0 = Sunday
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function splitPair(input: string): string[] {
  const lines = splitLines(input)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length !== 1) return lines;
  return lines[0]!.split(/\s*(?:→|\.\.)\s*|\s+[-–—]\s+/).map((p) => p.trim());
}

// ---------- modes ----------

function between(input: string, ctx: RunContext) {
  const parts = splitPair(input);
  if (parts.length > 2) fail('error.duration.pair');
  const a = parseDate(parts[0] ?? '', ctx);
  const b = parseDate(parts[1] ?? '', ctx);
  const sign = b < a ? -1 : 1;
  const [from, to] = sign < 0 ? [b, a] : [a, b];
  const wFrom = toWall(from, ctx.tz);
  const wTo = toWall(to, ctx.tz);

  const fa = new Date(wFrom);
  const fb = new Date(wTo);
  let months = (fb.getUTCFullYear() - fa.getUTCFullYear()) * 12 + (fb.getUTCMonth() - fa.getUTCMonth());
  while (months > 0 && addMonths(wFrom, months) > wTo) months--;
  let rest = wTo - addMonths(wFrom, months);
  const days = Math.floor(rest / DAY);
  rest -= days * DAY;
  const hours = Math.floor(rest / HOUR);
  rest -= hours * HOUR;
  const minutes = Math.floor(rest / MINUTE);
  rest -= minutes * MINUTE;
  const seconds = Math.floor(rest / SECOND);

  const ms = (to - from) * sign;
  const lang = ctx.locale === 'tr' ? 'tr-TR' : 'en-US';
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const biz = businessDays(Math.floor(wFrom / DAY), Math.floor(wTo / DAY)) * sign;
  const human = humanParts({ years: Math.floor(months / 12), months: months % 12, days, hours, minutes, seconds }, ctx.locale);
  const row = (key: string, value: string) => [ctx.t(`tool.duration.${key}`), value];
  const rows = [
    row('from', isoInZone(new Date(a), ctx.tz)),
    row('to', isoInZone(new Date(b), ctx.tz)),
    row('difference', sign < 0 ? `−${human}` : human),
    row('totalDays', nf.format(ms / DAY)),
    row('totalHours', nf.format(ms / HOUR)),
    row('totalMinutes', nf.format(ms / MINUTE)),
    row('totalSeconds', nf.format(ms / SECOND)),
    row('businessDays', nf.format(biz)),
    row('iso', isoDuration(ms)),
  ];
  return {
    output: { columns: [ctx.t('tool.duration.unit'), ctx.t('tool.duration.value')], rows },
    meta: { mode: 'between', ms, businessDays: biz },
  };
}

function add(input: string, amount: string, ctx: RunContext) {
  const p = parseDuration(amount);
  if (!p) fail('error.duration.amount', { input: amount.trim().slice(0, 40) });
  const lines = splitLines(input).map((l) => l.trim());
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  const out = lines.map((line) => {
    if (line === '' && lines.length > 1) return '';
    const start = parseDate(line, ctx);
    // calendar units move the local wall clock (DST-safe); clock units move the instant
    let wall = toWall(start, ctx.tz);
    wall = addMonths(wall, Math.trunc(p.years * 12 + p.months));
    wall += (p.weeks * 7 + p.days) * DAY;
    const ms = fromWall(wall, ctx.tz) + p.hours * HOUR + p.minutes * MINUTE + p.seconds * SECOND + p.ms;
    if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) fail('error.duration.amount', { input: amount.trim().slice(0, 40) });
    return isoInZone(new Date(ms), ctx.tz);
  });
  return { output: out.join('\n'), meta: { mode: 'add', count: out.filter(Boolean).length } };
}

function convert(input: string, ctx: RunContext) {
  const p = parseDuration(input);
  if (!p) fail('error.duration.duration', { input: input.trim().slice(0, 40) });
  const ms = partsToMs(p);
  const lang = ctx.locale === 'tr' ? 'tr-TR' : 'en-US';
  const nf = new Intl.NumberFormat(lang, { maximumFractionDigits: 4 });
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / HOUR);
  const m = Math.floor((abs % HOUR) / MINUTE);
  const s = Math.floor((abs % MINUTE) / SECOND);
  const msPart = Math.round(abs % SECOND);
  const sign = ms < 0 ? '−' : '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const row = (key: string, value: string) => [ctx.t(`tool.duration.${key}`), value];
  const rows = [
    row('human', sign + humanParts({ days: d, hours: h, minutes: m, seconds: s, milliseconds: msPart }, ctx.locale)),
    row('clock', `${sign}${pad(d * 24 + h)}:${pad(m)}:${pad(s)}`),
    row('iso', isoDuration(ms)),
    row('totalMs', nf.format(ms)),
    row('totalSeconds', nf.format(ms / SECOND)),
    row('totalMinutes', nf.format(ms / MINUTE)),
    row('totalHours', nf.format(ms / HOUR)),
    row('totalDays', nf.format(ms / DAY)),
    row('totalWeeks', nf.format(ms / (7 * DAY))),
  ];
  return {
    output: { columns: [ctx.t('tool.duration.unit'), ctx.t('tool.duration.value')], rows },
    meta: { mode: 'convert', ms },
  };
}

export default defineTool<Opts>({
  id: 'duration',
  category: 'time',
  name: { en: 'Duration calculator', tr: 'Süre hesaplayıcı' },
  description: {
    en: 'Time between dates, business days, date + duration, unit conversion',
    tr: 'İki tarih arası süre, iş günü, tarihe süre ekleme, birim dönüşümü',
  },
  keywords: ['duration', 'difference', 'between', 'business days', 'add', 'iso8601', 'süre', 'fark', 'iş günü', 'tarih'],
  layout: 'table',
  detect: (input) => (ISO_DURATION_RE.test(input.trim()) ? 0.6 : 0),
  options: [
    { key: 'mode', type: 'segmented', values: ['between', 'add', 'convert'], default: 'between', hotkey: 'm' },
    { key: 'amount', type: 'text', default: '+1d', hotkey: 'a' },
  ],
  run(input, opts, ctx) {
    if (opts.mode === 'add') return add(input, opts.amount, ctx);
    // a pasted ISO 8601 duration ("P1DT2H") converts even when the tool opened in "between"
    if (opts.mode === 'convert' || ISO_DURATION_RE.test(input.trim())) return convert(input, ctx);
    return between(input, ctx);
  },
  examples: [
    {
      input: '2026-01-01 → 2026-01-31',
      output:
        'Unit                     Value\n───────────────────────  ──────────────────────────\nFrom                     2026-01-01 00:00:00 +00:00\nTo                       2026-01-31 00:00:00 +00:00\nDifference               30 days\nTotal days               30\nTotal hours              720\nTotal minutes            43,200\nTotal seconds            2,592,000\nBusiness days (Mon–Fri)  22\nISO 8601                 P30D',
    },
    { input: '2026-01-31', opts: { mode: 'add', amount: '+1mo 2h' }, output: '2026-02-28 02:00:00 +00:00' },
    {
      input: '90061s',
      opts: { mode: 'convert' },
      output:
        'Unit                Value\n──────────────────  ──────────────────────\nReadable            1 day 1 hr 1 min 1 sec\nClock (h:mm:ss)     25:01:01\nISO 8601            P1DT1H1M1S\nTotal milliseconds  90,061,000\nTotal seconds       90,061\nTotal minutes       1,501.0167\nTotal hours         25.0169\nTotal days          1.0424\nTotal weeks         0.1489',
    },
  ],
});
