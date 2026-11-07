import { fail, type Locale } from '@kotilo/kit-core';

export function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Option value or context tz; throws a ToolError for unknown zones. */
export function resolveTz(opt: string, fallback: string): string {
  const tz = opt.trim() || fallback;
  if (!validTimeZone(tz)) fail('error.time.tz', { tz });
  return tz;
}

/** `2026-11-07 14:03:09 +03:00` in the given zone. */
export function isoInZone(date: Date, tz: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const offset = (parts.timeZoneName ?? 'GMT').replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`;
}

export function humanDate(date: Date, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: tz,
  }).format(date);
}
