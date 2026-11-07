import { parse, stringify } from 'smol-toml';
import { localeFromTag } from './i18n.js';
import type { Locale } from './types.js';

export interface KitConfig {
  general: { locale: Locale; hotkey: string; start_hidden: boolean };
  /** `detect` undefined = not asked yet (first launch asks). */
  clipboard: { detect?: boolean };
  theme: {
    id: string;
    follow_system: boolean;
    font: string;
    size: number;
    ligatures: boolean;
    palette_opacity: number;
    radius: number;
    compact: boolean;
  };
  /** Only tool ids and when they were used (Unix seconds, same order) — never content. */
  recent: { ids: string[]; used: number[] };
}

export const RECENT_MAX = 5;

export function defaultConfig(opts: { locale?: Locale; platform?: string } = {}): KitConfig {
  return {
    general: {
      locale: opts.locale ?? 'en',
      hotkey: opts.platform === 'darwin' ? 'Cmd+Shift+K' : 'Ctrl+Shift+K',
      start_hidden: true,
    },
    clipboard: {},
    theme: {
      id: 'catppuccin-mocha',
      follow_system: true,
      font: 'JetBrains Mono',
      size: 13,
      ligatures: true,
      palette_opacity: 96,
      radius: 12,
      compact: false,
    },
    recent: { ids: [], used: [] },
  };
}

const clamp = (n: unknown, min: number, max: number, dflt: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
const str = (v: unknown, dflt: string) => (typeof v === 'string' && v ? v : dflt);
const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt);

/** Parse config.toml leniently: unknown/invalid values fall back to defaults instead of failing. */
export function parseConfig(source: string, defaults: KitConfig = defaultConfig()): KitConfig {
  const raw = source.trim() ? (parse(source) as Record<string, Record<string, unknown>>) : {};
  const g = raw.general ?? {};
  const c = raw.clipboard ?? {};
  const th = raw.theme ?? {};
  const r = raw.recent ?? {};
  const d = defaults;
  return {
    general: {
      locale: typeof g.locale === 'string' ? localeFromTag(g.locale) : d.general.locale,
      hotkey: str(g.hotkey, d.general.hotkey),
      start_hidden: bool(g.start_hidden, d.general.start_hidden),
    },
    clipboard: typeof c.detect === 'boolean' ? { detect: c.detect } : {},
    theme: {
      id: str(th.id, d.theme.id),
      follow_system: bool(th.follow_system, d.theme.follow_system),
      font: str(th.font, d.theme.font),
      size: clamp(th.size, 11, 18, d.theme.size),
      ligatures: bool(th.ligatures, d.theme.ligatures),
      palette_opacity: clamp(th.palette_opacity, 60, 100, d.theme.palette_opacity),
      radius: clamp(th.radius, 0, 16, d.theme.radius),
      compact: bool(th.compact, d.theme.compact),
    },
    recent: parseRecent(r.ids, r.used),
  };
}

export function stringifyConfig(config: KitConfig): string {
  return stringify(config) + '\n';
}

function parseRecent(ids: unknown, used: unknown): KitConfig['recent'] {
  const out: KitConfig['recent'] = { ids: [], used: [] };
  if (!Array.isArray(ids)) return out;
  const times = Array.isArray(used) ? used : [];
  ids.forEach((id, i) => {
    if (typeof id !== 'string' || out.ids.length >= RECENT_MAX) return;
    const t = times[i];
    out.ids.push(id);
    out.used.push(typeof t === 'number' && Number.isFinite(t) ? t : 0); // 0 = unknown
  });
  return out;
}

/** Move `id` to the front of the recent list (ids + use time only, max 5). */
export function pushRecent(config: KitConfig, id: string, nowSec = 0): KitConfig {
  const keep = config.recent.ids.map((x, i) => [x, config.recent.used[i] ?? 0] as const).filter(([x]) => x !== id);
  const list = [[id, nowSec] as const, ...keep].slice(0, RECENT_MAX);
  return { ...config, recent: { ids: list.map(([x]) => x), used: list.map(([, t]) => t) } };
}

/**
 * Directory holding config.toml, themes/, tools/, pipelines/.
 * Pure: the shell passes platform + env (no fs/process access in core).
 */
export function configDir(platform: string, env: Record<string, string | undefined>): string {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? `${env.USERPROFILE ?? 'C:\\Users\\Default'}\\AppData\\Roaming`;
    return `${appData}\\kotilo\\kit`;
  }
  const base = env.XDG_CONFIG_HOME || `${env.HOME ?? '~'}/.config`;
  return `${base}/kotilo/kit`;
}

export function configPath(platform: string, env: Record<string, string | undefined>): string {
  return `${configDir(platform, env)}${platform === 'win32' ? '\\' : '/'}config.toml`;
}
