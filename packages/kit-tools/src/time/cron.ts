import { defineTool, fail } from '@kotilo/kit-core';
import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue/i18n.js';
import { isoInZone, resolveTz } from '../_lib/date.js';

type Opts = { tz: string; count: number };

const FIELD_RE = /^[\d*/,\-?LW#A-Za-z]+$/;
const MACRO_RE = /^@(yearly|annually|monthly|weekly|daily|hourly|weekdays|weekends)$/;

export function looksLikeCron(input: string): number {
  const s = input.trim();
  if (MACRO_RE.test(s)) return 0.7;
  const fields = s.split(/\s+/);
  if (fields.length < 5 || fields.length > 6) return 0;
  if (!fields.every((f) => FIELD_RE.test(f))) return 0;
  if (!fields.some((f) => f.includes('*') || f.includes('/'))) return 0;
  // most fields should start with a digit or '*'
  return fields.filter((f) => /^[\d*?]/.test(f)).length >= fields.length - 2 ? 0.7 : 0;
}

export default defineTool<Opts>({
  id: 'cron',
  category: 'time',
  name: { en: 'Cron expression', tr: 'Cron ifadesi' },
  description: { en: 'Explain a cron expression and list its next runs', tr: 'Cron ifadesini açıkla, sonraki çalışmaları listele' },
  keywords: ['cron', 'crontab', 'schedule', 'zamanla', 'quartz'],
  detect: looksLikeCron,
  options: [
    { key: 'tz', type: 'text', default: '', hotkey: 'z' },
    { key: 'count', type: 'number', default: 5, min: 1, max: 50 },
  ],
  run(input, opts, ctx) {
    const expr = input.trim();
    if (!expr) fail('error.cron.empty');
    const tz = resolveTz(opts.tz, ctx.tz);
    let description: string;
    let next: string[];
    try {
      description = cronstrue.toString(expr, { locale: ctx.locale, use24HourTimeFormat: true, throwExceptionOnParseError: true });
      const it = CronExpressionParser.parse(expr, { currentDate: ctx.now, tz, strict: false });
      next = it.take(opts.count).map((d) => isoInZone(d.toDate(), tz));
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      fail('error.cron.invalid', { detail });
    }
    const lines = [description, '', `// ${ctx.t('tool.cron.next', { count: next.length, tz })}`, ...next];
    return { output: lines.join('\n'), meta: { fields: expr.startsWith('@') ? 0 : expr.split(/\s+/).length } };
  },
  examples: [],
});
