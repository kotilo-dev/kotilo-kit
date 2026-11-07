import type { Category, Detection, KitConfig, Locale, Registry, Tool } from '@kotilo/kit-core';

export type Section = 'suggested' | 'recent' | 'results' | 'all';

export interface PaletteItem {
  tool: Tool<any>;
  section: Section;
  /** Unix seconds of last use (recent rows). */
  usedAt?: number;
}

export const SUGGESTED_MAX = 3;
export const RESULTS_MAX = 9;

/**
 * Palette rows.
 * - query: fuzzy results.
 * - no query: SUGGESTED (clipboard detection, top 3) then RECENT (max 5, without duplicates);
 *   if both are empty (first launch, empty clipboard) every tool is listed.
 */
export function buildItems(opts: {
  registry: Registry;
  query: string;
  detections: readonly Detection[];
  recent: KitConfig['recent'];
}): PaletteItem[] {
  const { registry, query, detections, recent } = opts;
  if (query.trim()) {
    return registry
      .search(query, { recent: recent.ids, limit: RESULTS_MAX })
      .map(({ tool }) => ({ tool, section: 'results' as const }));
  }
  const suggested = detections.slice(0, SUGGESTED_MAX).map(({ tool }) => ({ tool, section: 'suggested' as const }));
  const taken = new Set(suggested.map((i) => i.tool.id));
  const recentItems: PaletteItem[] = [];
  recent.ids.forEach((id, i) => {
    const tool = registry.get(id);
    if (!tool || taken.has(id)) return;
    taken.add(id);
    recentItems.push({ tool, section: 'recent', usedAt: recent.used[i] ?? 0 });
  });
  if (!suggested.length && !recentItems.length) {
    return registry.tools.map((tool) => ({ tool, section: 'all' as const }));
  }
  return [...suggested, ...recentItems];
}

const intlLocale = (l: Locale) => (l === 'tr' ? 'tr-TR' : 'en-US');

/** "2 dk. önce" · "bugün" · "dün" · "3 gün önce" (Intl, short). Empty when unknown. */
export function formatUsed(usedSec: number, now: Date, locale: Locale): string {
  if (!usedSec) return '';
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto', style: 'short' });
  const diffSec = Math.max(0, Math.round(now.getTime() / 1000 - usedSec));
  if (diffSec < 60) return rtf.format(0, 'second');
  if (diffSec < 3600) return rtf.format(-Math.floor(diffSec / 60), 'minute');
  const then = new Date(usedSec * 1000);
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(then)) / 86_400_000);
  return rtf.format(-days, 'day');
}

/** Fixed category → accent token mapping (docs/02-design.md). */
export const CATEGORY_ACCENT: Record<Category, string> = {
  encoding: 'blue',
  format: 'yellow',
  text: 'green',
  time: 'peach',
  generate: 'mauve',
  web: 'teal',
  visual: 'red',
  pipeline: 'blue',
};

/** One-line clipboard preview for the strip (ellipsis is CSS). */
export function clipboardPreview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}
