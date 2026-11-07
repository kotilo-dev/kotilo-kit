import { CATEGORIES, type Category, type Detection, type KitConfig, type Locale, type Registry, type Tool, type ToolResult } from '@kotilo/kit-core';

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

export const intlLocale = (l: Locale) => (l === 'tr' ? 'tr-TR' : 'en-US');

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

/** Sidebar groups in catalog order; `query` filters by name/id/keyword (tr-TR aware). Empty groups are dropped. */
export function groupTools(
  tools: readonly Tool<any>[],
  locale: Locale,
  query = '',
): { category: Category; tools: Tool<any>[] }[] {
  const q = query.trim().toLocaleLowerCase(intlLocale(locale));
  const match = (tool: Tool<any>) =>
    !q ||
    [tool.id, tool.name[locale], tool.name.en, ...tool.keywords].some((s) =>
      s.toLocaleLowerCase(intlLocale(locale)).includes(q),
    );
  return CATEGORIES.map((category) => ({ category, tools: tools.filter((t) => t.category === category && match(t)) })).filter(
    (g) => g.tools.length > 0,
  );
}

/** UTF-8 byte length without allocating. */
export function utf8Length(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export type OutputSummary =
  | { kind: 'chars'; chars: number }
  | { kind: 'rows'; rows: number }
  | { kind: 'binary'; bytes: number };

export function summarizeOutput(result: ToolResult): OutputSummary {
  if (result.bytes) return { kind: 'binary', bytes: result.bytes.length };
  if (typeof result.output !== 'string') return { kind: 'rows', rows: result.output.rows.length };
  return { kind: 'chars', chars: [...result.output].length };
}
