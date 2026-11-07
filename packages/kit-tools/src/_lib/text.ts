import type { Locale } from '@kotilo/kit-core';

/** Letters that only appear in Turkish text (among Latin-script languages we care about). */
const TURKISH_RE = /[ğĞışŞİ]/;

export type LangOption = 'auto' | 'tr' | 'en';

/**
 * Resolve the language used for case mapping / collation.
 * `auto`: Turkish if the text contains Turkish-only letters, otherwise the UI locale.
 */
export function resolveLang(opt: LangOption, text: string, uiLocale: Locale): 'tr-TR' | 'en-US' {
  if (opt === 'tr') return 'tr-TR';
  if (opt === 'en') return 'en-US';
  return TURKISH_RE.test(text) || uiLocale === 'tr' ? 'tr-TR' : 'en-US';
}

export const splitLines = (s: string): string[] => s.split(/\r?\n/);

/** Human duration like "2d 3h 4m" (localized unit letters). */
export function shortDuration(ms: number, locale: Locale): string {
  const units: [number, string, string][] = [
    [86_400_000, 'd', 'g'],
    [3_600_000, 'h', 's'],
    [60_000, 'm', 'dk'],
    [1000, 's', 'sn'],
  ];
  let rest = Math.abs(ms);
  const parts: string[] = [];
  for (const [size, en, tr] of units) {
    const n = Math.floor(rest / size);
    if (n > 0 || (parts.length === 0 && size === 1000)) parts.push(`${n}${locale === 'tr' ? ' ' + tr : en}`);
    rest -= n * size;
    if (parts.length === 2) break;
  }
  return parts.join(' ');
}

/** "3 days ago" / "3 gün önce" via Intl.RelativeTimeFormat, picking the largest sensible unit. */
export function relativeTime(ms: number, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { numeric: 'auto' });
  const abs = Math.abs(ms);
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];
  for (const [unit, size] of table) {
    if (abs >= size || unit === 'second') return rtf.format(Math.round(ms / size), unit);
  }
  return '';
}
