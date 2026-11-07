import { defineTool, fail } from '@kotilo/kit-core';
import { humanDate, isoInZone, resolveTz } from '../_lib/date.js';
import { relativeTime } from '../_lib/text.js';

type Unit = 'auto' | 's' | 'ms' | 'us' | 'ns';
type Opts = { unit: Unit; tz: string };

const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUM_RE = /^-?\d+(\.\d+)?$/;

/** Guess the unit of a numeric timestamp from its magnitude (digits of the integer part). */
export function guessUnit(n: string): Exclude<Unit, 'auto'> {
  const digits = n.replace(/^-/, '').split('.')[0]!.length;
  if (digits <= 11) return 's';
  if (digits <= 14) return 'ms';
  if (digits <= 17) return 'us';
  return 'ns';
}

const DIVISOR = { s: 1 / 1000, ms: 1, us: 1000, ns: 1_000_000 } as const;

export default defineTool<Opts>({
  id: 'timestamp',
  category: 'time',
  name: { en: 'Unix timestamp', tr: 'Unix zaman damgası' },
  description: { en: 'Convert Unix timestamps ⇄ dates, any time zone', tr: 'Unix zaman damgası ⇄ tarih, her saat diliminde' },
  keywords: ['epoch', 'unix', 'date', 'time', 'iso8601', 'tarih', 'saat', 'zaman'],
  layout: 'table',
  detect(input) {
    const s = input.trim();
    if (/^\d{10}$|^\d{13}$/.test(s)) return 0.85;
    if (ISO_RE.test(s)) return 0.8;
    return 0;
  },
  options: [
    { key: 'unit', type: 'segmented', values: ['auto', 's', 'ms', 'us', 'ns'], default: 'auto', hotkey: 'u' },
    { key: 'tz', type: 'text', default: '', hotkey: 'z' },
  ],
  run(input, opts, ctx) {
    const tz = resolveTz(opts.tz, ctx.tz);
    const s = input.trim();
    let ms: number;
    let unit: string = 'now';
    if (!s) ms = ctx.now.getTime();
    else if (NUM_RE.test(s)) {
      const u = opts.unit === 'auto' ? guessUnit(s) : opts.unit;
      unit = u;
      ms = Number(s) / DIVISOR[u];
    } else {
      ms = Date.parse(s.replace(' ', 'T'));
      if (Number.isNaN(ms)) ms = Date.parse(s);
      unit = 'date';
    }
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) fail('error.timestamp.invalid', { input: s.slice(0, 40) });

    const row = (key: string, value: string) => [ctx.t(`tool.timestamp.${key}`), value];
    const rows = [
      row('unixS', String(Math.floor(ms / 1000))),
      row('unixMs', String(Math.floor(ms))),
      row('iso', date.toISOString()),
      row('local', `${isoInZone(date, tz)}  (${tz})`),
      row('human', humanDate(date, tz, ctx.locale)),
      row('http', date.toUTCString()),
      row('relative', relativeTime(ms - ctx.now.getTime(), ctx.locale)),
    ];
    return { output: { columns: [ctx.t('tool.timestamp.format'), ctx.t('tool.timestamp.value')], rows }, meta: { unit } };
  },
  examples: [],
});
