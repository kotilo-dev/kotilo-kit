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

export function getTheme(id: string): Theme {
  return themes.find((t) => t.id === id) ?? themes.find((t) => t.id === DEFAULT_THEME)!;
}

/** The 7 themes shown as cards / in the tray (dark variants; light ones are their `pair`). */
export const primaryThemes: readonly Theme[] = themes.filter((t) => t.variant === 'dark');
