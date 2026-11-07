import Fuse from 'fuse.js';
import { t } from './i18n.js';
import type { Locale, Tool } from './types.js';

export interface Detection {
  tool: Tool<any>;
  score: number;
}

export interface SearchHit {
  tool: Tool<any>;
  score: number; // 0 = perfect … 1 = poor (fuse convention)
}

/** Only this much of the clipboard is shown to `detect` functions. */
export const DETECT_MAX_CHARS = 64 * 1024;
/** Per-call time budget for running all detectors. */
export const DETECT_BUDGET_MS = 20;

export interface Registry {
  readonly tools: readonly Tool<any>[];
  get(id: string): Tool<any> | undefined;
  search(query: string, opts?: { recent?: readonly string[]; limit?: number }): SearchHit[];
  detect(input: string, opts?: { limit?: number; budgetMs?: number }): Detection[];
}

export function createRegistry(tools: readonly Tool<any>[]): Registry {
  const byId = new Map<string, Tool<any>>();
  for (const tool of tools) {
    if (byId.has(tool.id)) throw new Error(`registry: duplicate tool id "${tool.id}"`);
    byId.set(tool.id, tool);
  }
  const list = [...byId.values()];

  const docs = list.map((tool) => ({
    id: tool.id,
    names: [tool.name.en, tool.name.tr],
    descriptions: [tool.description.en, tool.description.tr],
    keywords: tool.keywords,
    category: (['en', 'tr'] as Locale[]).map((l) => t(l, `category.${tool.category}`)),
  }));
  const fuse = new Fuse(docs, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.4,
    keys: [
      { name: 'id', weight: 3 },
      { name: 'names', weight: 3 },
      { name: 'keywords', weight: 2 },
      { name: 'category', weight: 1 },
      { name: 'descriptions', weight: 1 },
    ],
  });

  return {
    tools: list,
    get: (id) => byId.get(id),

    search(query, { recent = [], limit = 20 } = {}) {
      const q = query.trim();
      if (!q) {
        const recentTools = recent.flatMap((id) => byId.get(id) ?? []);
        const rest = list.filter((tool) => !recent.includes(tool.id));
        return [...recentTools, ...rest].slice(0, limit).map((tool) => ({ tool, score: 0 }));
      }
      return fuse
        .search(q.toLocaleLowerCase('tr-TR'))
        .map((r) => {
          const idx = recent.indexOf(r.item.id);
          // recently used tools float up a little (max ~0.15)
          const boost = idx < 0 ? 0 : 0.15 * (1 - idx / Math.max(recent.length, 1));
          return { tool: byId.get(r.item.id)!, score: Math.max(0, (r.score ?? 1) - boost) };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, limit);
    },

    detect(input, { limit = 3, budgetMs = DETECT_BUDGET_MS } = {}) {
      const sample = input.length > DETECT_MAX_CHARS ? input.slice(0, DETECT_MAX_CHARS) : input;
      if (!sample.trim()) return [];
      const start = performance.now();
      const hits: Detection[] = [];
      for (const tool of list) {
        if (!tool.detect) continue;
        if (performance.now() - start > budgetMs) break;
        let score: number;
        try {
          score = tool.detect(sample);
        } catch {
          score = 0; // a broken detector never breaks the palette
        }
        if (Number.isFinite(score) && score > 0) hits.push({ tool, score: Math.min(1, score) });
      }
      return hits.sort((a, b) => b.score - a.score).slice(0, limit);
    },
  };
}
