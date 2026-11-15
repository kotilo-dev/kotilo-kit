// @vitest-environment jsdom
import { createRegistry, defaultConfig, type KitConfig } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullWindow, configThemeStore, memoryConfigStore, type Host } from '../src/index.js';

const registry = createRegistry(builtinTools);

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('style');
});

function setup(opts: { locale?: 'en' | 'tr'; config?: (c: KitConfig) => KitConfig; setHotkey?: Host['setHotkey'] | null } = {}) {
  const base = defaultConfig({ locale: opts.locale ?? 'tr', platform: 'win32' });
  const config = memoryConfigStore(opts.config ? opts.config(base) : base);
  const setHotkey = opts.setHotkey === null ? undefined : (opts.setHotkey ?? vi.fn(async () => {}));
  const host: Host = {
    platform: 'windows',
    locale: opts.locale ?? 'tr',
    readClipboard: vi.fn(async () => ''),
    writeClipboard: vi.fn(async () => {}),
    saveFile: vi.fn(async () => {}),
    openFile: vi.fn(async () => null),
    notify: vi.fn(),
    openFull: vi.fn(),
    close: vi.fn(),
    config,
    theme: configThemeStore(config),
    onActivate: () => () => {},
    configPath: '%APPDATA%\\kotilo\\kit\\config.toml',
    openConfigFolder: vi.fn(),
    ...(setHotkey ? { setHotkey } : {}),
    now: () => new Date('2026-11-15T12:00:00Z'),
  };
  render(<FullWindow host={host} registry={registry} version="1.1.1" />);
  return { host, config };
}

const click = (el: Element) => act(async () => void fireEvent.click(el));
async function openSection(name: string) {
  await click(screen.getByRole('button', { name: /^(Ayarlar|Settings)$/ }));
  const nav = screen.getByRole('navigation', { name: /^(Ayarlar|Settings)$/ });
  await click(within(nav).getByRole('link', { name }));
}

describe('Settings sections (1.1.1)', () => {
  it('every sidebar entry is a working link now (no disabled sections)', async () => {
    setup();
    await click(screen.getByRole('button', { name: 'Ayarlar' }));
    const nav = screen.getByRole('navigation', { name: 'Ayarlar' });
    // no plugins/pipelines in this host, so those two stay hidden-disabled; the rest are links
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Genel', 'Görünüm', 'Kısayollar', 'Pano algılama', 'Gizlilik', 'Hakkında']);
  });

  it('General: switches the UI language live, toggles start hidden, opens the config folder', async () => {
    const { host, config } = setup();
    await openSection('Genel');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Genel');
    expect(screen.getByText('%APPDATA%\\kotilo\\kit\\config.toml', { selector: 'code' })).toBeTruthy();
    const hidden = screen.getByRole('checkbox', { name: 'Gizli başlat' }) as HTMLInputElement;
    expect(hidden.checked).toBe(true);
    await click(hidden);
    expect(config.get().general.start_hidden).toBe(false);
    await click(screen.getByRole('button', { name: 'Klasörü aç' }));
    expect(host.openConfigFolder).toHaveBeenCalled();
    await click(screen.getByRole('button', { name: 'English' }));
    expect(config.get().general.locale).toBe('en');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('General');
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('Shortcuts: records a new global shortcut, saves it only after the shell accepted it', async () => {
    const setHotkey = vi.fn(async () => {});
    const { config } = setup({ setHotkey });
    await openSection('Kısayollar');
    expect(screen.getByLabelText('Ctrl+Shift+K').textContent).toBe('CtrlShiftK');
    const change = screen.getByRole('button', { name: 'Değiştir' });
    await click(change);
    expect(screen.getByText('Tuşlara bas…')).toBeTruthy();
    // modifiers alone keep waiting
    await act(async () => void fireEvent.keyDown(change, { key: 'Control', code: 'ControlLeft', ctrlKey: true }));
    expect(setHotkey).not.toHaveBeenCalled();
    await act(async () => void fireEvent.keyDown(change, { key: ' ', code: 'Space', ctrlKey: true, altKey: true }));
    expect(setHotkey).toHaveBeenCalledWith('Ctrl+Alt+Space');
    expect(config.get().general.hotkey).toBe('Ctrl+Alt+Space');
    expect(screen.getByLabelText('Ctrl+Alt+Space')).toBeTruthy();
    // back to the platform default
    await click(screen.getByRole('button', { name: 'Varsayılan' }));
    expect(config.get().general.hotkey).toBe('Ctrl+Shift+K');
  });

  it('Shortcuts: a refused combo shows the conflict and keeps the old one; Esc cancels recording without leaving Settings', async () => {
    const setHotkey = vi.fn(async () => {
      throw new Error('HotKey already registered');
    });
    const { config } = setup({ setHotkey });
    await openSection('Kısayollar');
    const change = screen.getByRole('button', { name: 'Değiştir' });
    await click(change);
    await act(async () => void fireEvent.keyDown(change, { key: 'j', code: 'KeyJ', ctrlKey: true, altKey: true }));
    expect(screen.getByRole('alert').textContent).toBe('Ctrl+Alt+J kaydedilemedi: başka bir uygulama kullanıyor. Önceki kısayol (Ctrl+Shift+K) geçerli kaldı.');
    expect(config.get().general.hotkey).toBe('Ctrl+Shift+K');
    await click(screen.getByRole('button', { name: 'Değiştir' }));
    await act(async () => void fireEvent.keyDown(screen.getByRole('button', { name: 'Vazgeç' }), { key: 'Escape', code: 'Escape' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kısayollar');
    expect(screen.getByRole('button', { name: 'Değiştir' })).toBeTruthy();
  });

  it('Shortcuts: read-only when the shell cannot re-register; in-app key lists are shown', async () => {
    setup({ setHotkey: null });
    await openSection('Kısayollar');
    expect(screen.queryByRole('button', { name: 'Değiştir' })).toBeNull();
    expect(screen.getByText(/config.toml dosyasından değiştirilir/)).toBeTruthy();
    expect(screen.getByText('Ctrl Enter')).toBeTruthy();
    expect(screen.getByText('Ctrl Shift C')).toBeTruthy();
  });

  it('Clipboard: toggles detection and shows a JWT example ranked by the real detectors', async () => {
    const { config } = setup({ config: (c) => ({ ...c, clipboard: { detect: true } }) });
    await openSection('Pano algılama');
    const toggle = screen.getByRole('checkbox', { name: 'Panodaki içeriğe göre araç öner' }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await click(toggle);
    expect(config.get().clipboard.detect).toBe(false);
    const first = document.querySelector('.kf-sample-on .kf-sample-name')!;
    expect(first.textContent).toMatch(/JWT/);
  });

  it('Privacy: lists recent tool ids only and clears them', async () => {
    const { config } = setup({ config: (c) => ({ ...c, recent: { ids: ['jwt', 'base64'], used: [1, 2] } }) });
    await openSection('Gizlilik');
    const chips = screen.getByRole('list', { name: 'Son kullanılanlar' });
    expect(within(chips).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['jwt', 'base64']);
    await click(screen.getByRole('button', { name: 'Listeyi temizle' }));
    expect(config.get().recent).toEqual({ ids: [], used: [] });
    expect(screen.getByText('Henüz yok.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Listeyi temizle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('%APPDATA%\\kotilo\\kit\\')).toBeTruthy();
  });

  it('About: version, counts, copies links instead of opening a browser', async () => {
    const { host } = setup();
    await openSection('Hakkında');
    expect(screen.getByText('1.1.1', { selector: '.kf-about-version' })).toBeTruthy();
    expect(screen.getByText(`Çevrimdışı geliştirici araç kutusu · ${registry.tools.length} yerleşik araç · 0 eklenti · 0 pipeline`)).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Kaynak kod adresini kopyala' }));
    expect(host.writeClipboard).toHaveBeenCalledWith('https://github.com/kotilo-dev/kotilo-kit');
    expect(host.notify).toHaveBeenCalledWith('Panoya kopyalandı');
    await click(screen.getByRole('button', { name: 'Sürüm bilgisini kopyala' }));
    expect(host.writeClipboard).toHaveBeenLastCalledWith('Kotilo Kit 1.1.1 (windows)');
  });
});
