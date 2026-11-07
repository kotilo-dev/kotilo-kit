import { parse } from 'smol-toml';
import source from '../../../docs/05-themes.toml?raw';

/** Shared Kotilo token names (docs/02-design.md). Never invent new ones. */
export const TOKENS = [
  'crust',
  'mantle',
  'base',
  's0',
  's1',
  'overlay',
  'subtext',
  'text',
  'blue',
  'mauve',
  'green',
  'yellow',
  'peach',
  'red',
  'teal',
] as const;
export type Token = (typeof TOKENS)[number];

export interface Theme {
  id: string;
  name: string;
  variant: 'dark' | 'light';
  pair?: string;
  colors: Record<Token, string>;
}

export const DEFAULT_THEME = 'catppuccin-mocha';
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Parse a themes TOML (`[themes.<id>]` blocks). Missing or invalid tokens fall back to
 * `fallback` (Catppuccin Mocha) and are reported in `warnings` — a user theme never breaks the UI.
 */
export function parseThemes(toml: string, fallback?: Theme): { themes: Theme[]; warnings: string[] } {
  // invalid TOML throws (smol-toml TomlError) — callers importing user files catch and report it
  const raw = (parse(toml).themes ?? {}) as Record<string, Record<string, unknown>>;
  const warnings: string[] = [];
  const themes = Object.entries(raw).map(([id, t]) => {
    const colors = {} as Record<Token, string>;
    for (const token of TOKENS) {
      const v = t[token];
      if (typeof v === 'string' && HEX.test(v)) colors[token] = v.toLowerCase();
      else {
        warnings.push(`${id}: missing or invalid "${token}"`);
        colors[token] = fallback?.colors[token] ?? '#000000';
      }
    }
    return {
      id,
      name: typeof t.name === 'string' ? t.name : id,
      variant: t.variant === 'light' ? ('light' as const) : ('dark' as const),
      ...(typeof t.pair === 'string' ? { pair: t.pair } : {}),
      colors,
    };
  });
  return { themes, warnings };
}

/** `[data-theme="<id>"] { --kit-crust: …; … }` for every theme; the default theme also applies to `:root`. */
export function themesToCss(list: readonly Theme[], defaultId = DEFAULT_THEME): string {
  return list
    .map((theme) => {
      const selector = theme.id === defaultId ? `:root, [data-theme="${theme.id}"]` : `[data-theme="${theme.id}"]`;
      const vars = TOKENS.map((t) => `  --kit-${t}: ${theme.colors[t]};`).join('\n');
      return `${selector} {\n  color-scheme: ${theme.variant};\n${vars}\n}`;
    })
    .join('\n\n');
}

/** Built-in themes from docs/05-themes.toml (the single source of truth). */
export const themes: readonly Theme[] = parseThemes(source).themes;
export const themesCss: string = themesToCss(themes);

export function getTheme(id: string, list: readonly Theme[] = themes): Theme {
  return list.find((t) => t.id === id) ?? themes.find((t) => t.id === DEFAULT_THEME)!;
}

/** The 7 themes shown as cards / in the tray (dark variants; light ones are their `pair`). */
export const primaryThemes: readonly Theme[] = themes.filter((t) => t.variant === 'dark');

/**
 * Built-in themes plus user themes (Settings › Appearance › Import .toml, stored next to config.toml).
 * A user theme cannot replace a built-in id; it is skipped and reported.
 */
export function withUserThemes(user: readonly Theme[]): { list: Theme[]; skipped: string[] } {
  const builtin = new Set(themes.map((t) => t.id));
  const skipped = user.filter((t) => builtin.has(t.id)).map((t) => t.id);
  const seen = new Set<string>();
  const extra = user.filter((t) => !builtin.has(t.id) && !seen.has(t.id) && seen.add(t.id));
  return { list: [...themes, ...extra], skipped };
}

/**
 * The theme actually shown. With `followSystem`, a theme whose variant differs from the OS scheme
 * switches to its `pair` (Mocha ⇄ Latte); themes without a pair stay as they are (docs/01 F3).
 */
export function resolveThemeId(id: string, followSystem: boolean, prefersLight: boolean, list: readonly Theme[] = themes): string {
  const theme = list.find((t) => t.id === id) ?? list.find((t) => t.id === DEFAULT_THEME)!;
  if (!followSystem || !theme.pair) return theme.id;
  const wanted = prefersLight ? 'light' : 'dark';
  if (theme.variant === wanted) return theme.id;
  const pair = list.find((t) => t.id === theme.pair);
  return pair && pair.variant === wanted ? pair.id : theme.id;
}

/** WCAG 2.x contrast ratio of two `#rrggbb` colors (theme contrast CI and the settings screen). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

/** Serialize themes back to the `[themes.<id>]` TOML format (user themes file). */
export function themesToToml(list: readonly Theme[]): string {
  return list
    .map((t) =>
      [
        `[themes.${t.id}]`,
        `name = ${JSON.stringify(t.name)}`,
        `variant = "${t.variant}"`,
        ...(t.pair ? [`pair = "${t.pair}"`] : []),
        ...TOKENS.map((k) => `${k} = "${t.colors[k]}"`),
      ].join('\n'),
    )
    .join('\n\n') + (list.length ? '\n' : '');
}
