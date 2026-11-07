import type { KitConfig } from '@kotilo/kit-core';
import { parseThemes, resolveThemeId, themes, themesToCss, withUserThemes, type Theme } from '@kotilo/kit-themes';
import type { Host } from './host.js';

/** Monospace fonts bundled with the app (docs/01-requirements.md F3). */
export const MONO_FONTS = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Iosevka'] as const;

/** Inject (or refresh) the generated `--kit-*` theme CSS: built-ins from docs/05-themes.toml plus user themes. */
export function installThemes(doc: Document = document, list: readonly Theme[] = themes): void {
  let style = doc.getElementById('kit-themes');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'kit-themes';
    doc.head.appendChild(style);
  }
  style.textContent = themesToCss(list);
}

/** Switch theme instantly — CSS variables change, no restart. */
export function applyTheme(id: string, doc: Document = document): void {
  doc.documentElement.dataset.theme = id;
}

export function systemPrefersLight(win: Window = window): boolean {
  return win.matchMedia?.('(prefers-color-scheme: light)').matches ?? false;
}

/**
 * Apply every Appearance setting to the document: resolved theme (system light/dark pair),
 * mono font/size/ligatures, palette opacity, corner radius, density. Layout values are `--kp-*`
 * custom properties (not color tokens; colors stay `--kit-*` from the TOML).
 */
export function applyAppearance(
  theme: KitConfig['theme'],
  opts: { list?: readonly Theme[]; prefersLight?: boolean } = {},
  doc: Document = document,
): string {
  const root = doc.documentElement;
  const id = resolveThemeId(theme.id, theme.follow_system, opts.prefersLight ?? false, opts.list ?? themes);
  root.dataset.theme = id;
  root.dataset.density = theme.compact ? 'compact' : 'comfortable';
  const font = MONO_FONTS.includes(theme.font as (typeof MONO_FONTS)[number]) ? theme.font : 'JetBrains Mono';
  root.style.setProperty('--kp-mono', `"${font}", "JetBrains Mono", monospace`);
  root.style.setProperty('--kp-mono-size', `${theme.size}px`);
  root.style.setProperty('--kp-ligatures', theme.ligatures ? 'normal' : 'none');
  root.style.setProperty('--kp-palette-opacity', `${theme.palette_opacity}%`);
  root.style.setProperty('--kp-radius', `${theme.radius}px`);
  return id;
}

/** Parse the user themes file; broken TOML yields no themes plus a warning instead of throwing. */
export function parseUserThemes(toml: string): { themes: Theme[]; warnings: string[] } {
  if (!toml.trim()) return { themes: [], warnings: [] };
  try {
    return parseThemes(toml, themes[0]);
  } catch (e) {
    return { themes: [], warnings: [e instanceof Error ? e.message : String(e)] };
  }
}

/**
 * Keep a window's appearance in sync with config.toml, the user themes file and the OS light/dark
 * scheme. Returns an unsubscribe function. `onList` receives the current theme list (cards, tray).
 */
export function syncAppearance(
  host: Host,
  cb: { onList?: (list: Theme[]) => void; onApplied?: (themeId: string) => void } = {},
  doc: Document = document,
): () => void {
  const win = doc.defaultView ?? window;
  let list: Theme[] = [...themes];
  const apply = () => {
    const id = applyAppearance(host.config.get().theme, { list, prefersLight: systemPrefersLight(win) }, doc);
    cb.onApplied?.(id);
  };
  const loadUser = async () => {
    const text = (await host.userThemes?.read().catch(() => '')) ?? '';
    list = withUserThemes(parseUserThemes(text).themes).list;
    installThemes(doc, list);
    cb.onList?.(list);
    apply();
  };
  installThemes(doc, list);
  apply();
  void loadUser();
  const unConfig = host.config.subscribe(apply);
  const unUser = host.userThemes?.subscribe(() => void loadUser());
  const mq = win.matchMedia?.('(prefers-color-scheme: light)');
  mq?.addEventListener?.('change', apply);
  return () => {
    unConfig();
    unUser?.();
    mq?.removeEventListener?.('change', apply);
  };
}
