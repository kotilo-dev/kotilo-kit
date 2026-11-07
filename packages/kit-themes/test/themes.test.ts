import { describe, expect, it } from 'vitest';
import {
  TOKENS,
  getTheme,
  parseThemes,
  primaryThemes,
  resolveThemeId,
  themes,
  themesCss,
  themesToToml,
  withUserThemes,
} from '../src/index.js';

describe('themes.toml', () => {
  it('has the 7 built-in dark themes in spec order', () => {
    expect(primaryThemes.map((t) => t.name)).toEqual([
      'Catppuccin Mocha',
      'Gruvbox Dark',
      'Tokyo Night',
      'Everforest Dark',
      'Nord',
      'Rosé Pine Moon',
      'Dracula',
    ]);
  });

  it('every theme has all 15 tokens and pairs point to existing themes', () => {
    const ids = new Set(themes.map((t) => t.id));
    for (const t of themes) {
      expect(Object.keys(t.colors)).toEqual([...TOKENS]);
      if (t.pair) expect(ids, `${t.id}.pair`).toContain(t.pair);
    }
  });

  it('generates CSS custom properties with the --kit- prefix', () => {
    expect(themesCss).toContain(':root, [data-theme="catppuccin-mocha"] {');
    expect(themesCss).toContain('--kit-base: #1e1e2e;');
    expect(themesCss).toContain('[data-theme="dracula"]');
    expect(themesCss).toMatch(/\[data-theme="catppuccin-latte"\] \{\n {2}color-scheme: light;/);
  });

  it('falls back for unknown ids and fills missing tokens of user themes', () => {
    expect(getTheme('nope').id).toBe('catppuccin-mocha');
    const { themes: user, warnings } = parseThemes('[themes.mine]\nname = "Mine"\nbase = "#101010"\nred = "kırmızı"', getTheme('catppuccin-mocha'));
    expect(user[0]!.colors.base).toBe('#101010');
    expect(user[0]!.colors.red).toBe('#f38ba8');
    expect(warnings).toContain('mine: missing or invalid "red"');
  });
});

describe('system light/dark + user themes', () => {
  it('follow system switches to the pair only when the scheme differs', () => {
    expect(resolveThemeId('catppuccin-mocha', true, true)).toBe('catppuccin-latte');
    expect(resolveThemeId('catppuccin-mocha', true, false)).toBe('catppuccin-mocha');
    expect(resolveThemeId('catppuccin-latte', true, false)).toBe('catppuccin-mocha');
    expect(resolveThemeId('catppuccin-mocha', false, true)).toBe('catppuccin-mocha');
    // Nord and Dracula have no light pair: they stay
    expect(resolveThemeId('nord', true, true)).toBe('nord');
    expect(resolveThemeId('dracula', true, true)).toBe('dracula');
    expect(resolveThemeId('nope', false, false)).toBe('catppuccin-mocha');
  });

  it('user themes are appended, cannot replace built-ins, and round-trip through TOML', () => {
    const { themes: user } = parseThemes(themesToToml([{ ...getTheme('nord'), id: 'my-nord', name: 'My "Nord"' }]));
    expect(user[0]!.name).toBe('My "Nord"');
    expect(user[0]!.colors).toEqual(getTheme('nord').colors);
    const { list, skipped } = withUserThemes([...user, getTheme('dracula'), user[0]!]);
    expect(list.map((t) => t.id).slice(themes.length)).toEqual(['my-nord']);
    expect(skipped).toEqual(['dracula']);
    expect(getTheme('my-nord', list).name).toBe('My "Nord"');
    expect(themesToToml([])).toBe('');
  });
});
