import { translator } from './i18n.js';
import type { Locale, OptionDef, OptionValues, RunContext, Tool, ToolDef, ToolResult } from './types.js';

const ID_RE = /^[a-z][a-z0-9-]*$/;

/** Declare a tool. Built-in tools use exactly the same API as user plugins. */
export function defineTool<O extends OptionValues = OptionValues>(def: ToolDef<O>): Tool<O> {
  if (!ID_RE.test(def.id)) throw new Error(`defineTool: invalid id "${def.id}"`);
  const seen = new Set<string>();
  for (const opt of def.options ?? []) {
    if (seen.has(opt.key)) throw new Error(`defineTool(${def.id}): duplicate option "${opt.key}"`);
    seen.add(opt.key);
    if ((opt.type === 'segmented' || opt.type === 'select') && !opt.values.includes(opt.default)) {
      throw new Error(`defineTool(${def.id}): default "${opt.default}" not in values of "${opt.key}"`);
    }
  }
  return {
    keywords: [],
    options: [],
    layout: 'input-output',
    accepts: ['text'],
    examples: [],
    ...def,
  } as Tool<O>;
}

/** Defaults merged with `opts`; unknown keys dropped, values coerced and clamped to the option spec. */
export function resolveOptions(options: OptionDef[], opts: Record<string, unknown> = {}): OptionValues {
  const out: OptionValues = {};
  for (const def of options) {
    const raw = opts[def.key];
    out[def.key] = raw === undefined ? def.default : coerce(def, raw);
  }
  return out;
}

function coerce(def: OptionDef, raw: unknown): string | number | boolean {
  switch (def.type) {
    case 'toggle':
      if (typeof raw === 'boolean') return raw;
      return ['1', 'true', 'yes', 'on', ''].includes(String(raw).toLowerCase());
    case 'number': {
      let n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return def.default;
      if (def.min !== undefined) n = Math.max(def.min, n);
      if (def.max !== undefined) n = Math.min(def.max, n);
      return n;
    }
    case 'segmented':
    case 'select': {
      const s = String(raw);
      return def.values.includes(s) ? s : def.default;
    }
    case 'text':
      return String(raw);
  }
}

export interface ContextInit {
  locale?: Locale;
  now?: Date;
  tz?: string;
  random?: (n: number) => Uint8Array;
  bytes?: Uint8Array;
}

/** Build a RunContext; shells call this, tests pass a fixed clock and seeded randomness. */
export function createContext(init: ContextInit = {}): RunContext {
  const locale = init.locale ?? 'en';
  return {
    locale,
    now: init.now ?? new Date(),
    tz: init.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    random: init.random ?? ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n))),
    ...(init.bytes ? { bytes: init.bytes } : {}),
    t: translator(locale),
  };
}

/** Run a tool with option resolution. Throws ToolError on invalid input. */
export function runTool(
  tool: Tool<any>,
  input: string,
  opts?: Record<string, unknown>,
  ctx: RunContext | ContextInit = {},
): ToolResult {
  const context = 't' in ctx ? ctx : createContext(ctx);
  return tool.run(input, resolveOptions(tool.options, opts), context);
}
