// @vitest-environment jsdom
import { createRegistry, defaultConfig } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { getTheme, themesToToml } from '@kotilo/kit-themes';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullWindow, applyAppearance, configThemeStore, memoryConfigStore, parseUserThemes, type Host } from '../src/index.js';

const registry = createRegistry(builtinTools);
let prefersLight = false;
const mqListeners = new Set<() => void>();

beforeEach(() => {
  prefersLight = false;
  mqListeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes('light') && prefersLight;
    },
    addEventListener: (_: string, cb: () => void) => mqListeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => mqListeners.delete(cb),
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('style');
});

function setup(opts: { locale?: 'en' | 'tr'; userThemes?: string; file?: File | null } = {}) {
  const config = memoryConfigStore(defaultConfig({ locale: opts.locale ?? 'tr' }));
  let themesFile = opts.userThemes ?? '';
  const subs = new Set<() => void>();
  const host = {
    platform: 'windows',
    locale: opts.locale ?? 'tr',
    readClipboard: vi.fn(async () => ''),
    writeClipboard: vi.fn(async () => {}),
    saveFile: vi.fn(async () => {}),
    openFile: vi.fn(async () => opts.file ?? null),
    notify: vi.fn(),
    openFull: vi.fn(),
    close: vi.fn(),
    config,
    theme: configThemeStore(config),
    onActivate: () => () => {},
    userThemes: {
      read: async () => themesFile,
      write: vi.fn(async (t: string) => {
        themesFile = t;
        subs.forEach((cb) => cb());
      }),
      subscribe: (cb: () => void) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
    },
    configPath: '%APPDATA%\\kotilo\\kit\\config.toml',
    now: () => new Date('2026-11-07T12:00:00Z'),
  } satisfies Host;
  render(<FullWindow host={host} registry={registry} version="0.1.0" />);
  return { host, config, themesFile: () => themesFile };
}

const settle = () => act(async () => {});
const root = () => document.documentElement;
const openSettings = async () => {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Ayarlar' })));
  await settle();
};

describe('Settings › Appearance', () => {
  it('opens from the title bar with the mockup breadcrumb, nav and status bar; Esc goes back', async () => {
    setup();
    await openSettings();
    const crumbs = screen.getByRole('navigation', { name: 'Konum' });
    expect(crumbs.textContent).toBe('Kotilo Kit/Ayarlar/Görünüm');
    const nav = screen.getByRole('navigation', { name: 'Ayarlar' });
    expect(within(nav).getAllByText(/./).map((n) => n.textContent)).toEqual([
      'Genel',
      'Görünüm',
      'Kısayollar',
      'Pano algılama',
      'Eklentiler',
      "Pipeline'lar",
      'Gizlilik',
      'Hakkında',
    ]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tema');
    expect(screen.getByText('ayarlar: %APPDATA%\\kotilo\\kit\\config.toml')).toBeTruthy();
    await act(async () => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(screen.queryByRole('navigation', { name: 'Konum' })).toBeNull();
    expect(screen.getByPlaceholderText('Araç ara veya panodan yapıştır…')).toBeTruthy();
  });

  it('shows the 7 theme cards plus "+ Özel tema"; clicking a card switches the theme instantly', async () => {
    const { config } = setup();
    await openSettings();
    const cards = screen.getAllByRole('radio');
    expect(cards.map((c) => c.querySelector('.kf-card-name')!.textContent)).toEqual([
      'Catppuccin Mocha',
      'Gruvbox Dark',
      'Tokyo Night',
      'Everforest Dark',
      'Nord',
      'Rosé Pine Moon',
      'Dracula',
    ]);
    expect(cards[0]!.getAttribute('aria-checked')).toBe('true');
    // each preview is scoped to its own theme's variables
    expect(cards[4]!.querySelector('.kf-card-preview')!.getAttribute('data-theme')).toBe('nord');
    expect(screen.getByRole('button', { name: '+ Özel tema' })).toBeTruthy();
    await act(async () => void fireEvent.click(cards[4]!));
    expect(config.get().theme.id).toBe('nord');
    expect(root().dataset.theme).toBe('nord');
    expect(screen.getAllByRole('radio')[4]!.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Nord', { selector: '.kf-status span' })).toBeTruthy();
  });

  it('follows the system scheme through the theme pair and reacts to OS changes', async () => {
    const { config } = setup();
    await openSettings();
    const follow = screen.getByRole('checkbox', { name: 'Sistem açık/koyu modunu izle' }) as HTMLInputElement;
    expect(follow.checked).toBe(true); // default on
    expect(root().dataset.theme).toBe('catppuccin-mocha');
    prefersLight = true;
    await act(async () => mqListeners.forEach((cb) => cb()));
    expect(root().dataset.theme).toBe('catppuccin-latte');
    // the Mocha card stays selected while Latte is shown
    expect(screen.getAllByRole('radio')[0]!.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Catppuccin Latte', { selector: '.kf-status span' })).toBeTruthy();
    await act(async () => void fireEvent.click(follow));
    expect(config.get().theme.follow_system).toBe(false);
    expect(root().dataset.theme).toBe('catppuccin-mocha');
  });

  it('applies font, size, ligatures, opacity, radius and density as CSS variables', async () => {
    const { config } = setup();
    await openSettings();
    await act(async () => void fireEvent.change(screen.getByRole('combobox', { name: 'Monospace' }), { target: { value: 'Iosevka' } }));
    await act(async () => void fireEvent.change(screen.getByRole('slider', { name: 'Boyut' }), { target: { value: '16' } }));
    await act(async () => void fireEvent.click(screen.getByRole('checkbox', { name: "Ligature'ları aç" })));
    await act(async () => void fireEvent.change(screen.getByRole('slider', { name: 'Palette opaklığı' }), { target: { value: '70' } }));
    await act(async () => void fireEvent.change(screen.getByRole('slider', { name: 'Köşe yarıçapı' }), { target: { value: '4' } }));
    await act(async () => void fireEvent.click(screen.getByRole('checkbox', { name: 'Kompakt yoğunluk' })));
    expect(config.get().theme).toMatchObject({ font: 'Iosevka', size: 16, ligatures: false, palette_opacity: 70, radius: 4, compact: true });
    const s = root().style;
    expect(s.getPropertyValue('--kp-mono')).toBe('"Iosevka", "JetBrains Mono", monospace');
    expect(s.getPropertyValue('--kp-mono-size')).toBe('16px');
    expect(s.getPropertyValue('--kp-ligatures')).toBe('none');
    expect(s.getPropertyValue('--kp-palette-opacity')).toBe('70%');
    expect(s.getPropertyValue('--kp-radius')).toBe('4px');
    expect(root().dataset.density).toBe('compact');
    expect(screen.getByText('16', { selector: '.kf-setting-value' })).toBeTruthy();
  });

  it('imports a .toml theme: saved to the user themes file, shown as a card and selected', async () => {
    const toml = themesToToml([{ ...getTheme('dracula'), id: 'night-owl', name: 'Night Owl' }]);
    const { themesFile, config } = setup({ file: new File([toml], 'night-owl.toml') });
    await openSettings();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Tema içe aktar (.toml)' })));
    await settle();
    expect(parseUserThemes(themesFile()).themes.map((t) => t.id)).toEqual(['night-owl']);
    expect(config.get().theme.id).toBe('night-owl');
    expect(root().dataset.theme).toBe('night-owl');
    expect(document.getElementById('kit-themes')!.textContent).toContain('[data-theme="night-owl"]');
    const cards = screen.getAllByRole('radio');
    expect(cards).toHaveLength(8);
    expect(cards[7]!.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('1 tema içe aktarıldı.');
  });

  it('reports broken files and built-in ids without saving anything', async () => {
    const broken = setup({ file: new File(['[themes.x\nbase = '], 'x.toml') });
    await openSettings();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '+ Özel tema' })));
    await settle();
    expect(screen.getByRole('alert').textContent).toMatch(/^Tema içe aktarılamadı: /);
    expect(broken.host.userThemes.write).not.toHaveBeenCalled();
    cleanup();

    const builtin = setup({ file: new File([themesToToml([getTheme('nord')])], 'nord.toml') });
    await openSettings();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: '+ Özel tema' })));
    await settle();
    expect(screen.getByRole('alert').textContent).toBe('Yerleşik tema adları değiştirilemez: nord');
    expect(builtin.host.userThemes.write).not.toHaveBeenCalled();
  });

  it('loads previously imported themes at start (a theme stored in config keeps working)', async () => {
    const toml = themesToToml([{ ...getTheme('nord'), id: 'mine', name: 'Mine' }]);
    const { host } = setup({ userThemes: toml });
    await act(async () => host.config.update((c) => ({ ...c, theme: { ...c.theme, id: 'mine' } })));
    expect(root().dataset.theme).toBe('mine');
    expect(screen.getByText('Mine', { selector: '.kf-status span' })).toBeTruthy();
  });

  it('applyAppearance falls back to JetBrains Mono for unknown fonts', () => {
    const t = defaultConfig().theme;
    applyAppearance({ ...t, font: 'Comic Sans' });
    expect(root().style.getPropertyValue('--kp-mono')).toBe('"JetBrains Mono", "JetBrains Mono", monospace');
  });
});
