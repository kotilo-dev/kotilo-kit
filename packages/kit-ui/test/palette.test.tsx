// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry, defaultConfig, type KitConfig } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Palette, configThemeStore, memoryConfigStore, type Host } from '../src/index.js';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsIm5hbWUiOiLDh2HEn3LEsSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.2uI2kSHB-vc1nK7YbgY-78eLxa2XDjivHfQ0tdjbcmw';
const NOW = new Date('2026-11-07T12:00:00Z');
const registry = createRegistry(builtinTools);

function setup(opts: { clipboard?: string; config?: Partial<KitConfig>; platform?: Host['platform'] } = {}) {
  const base = defaultConfig({ locale: 'en' });
  const config = memoryConfigStore({ ...base, clipboard: { detect: true }, ...opts.config });
  let clipboard = opts.clipboard ?? '';
  const activateSubs = new Set<() => void>();
  const host = {
    platform: opts.platform ?? 'windows',
    locale: 'en',
    readClipboard: vi.fn(async () => clipboard),
    writeClipboard: vi.fn(async (text: string) => {
      clipboard = text;
    }),
    saveFile: vi.fn(),
    openFile: vi.fn(async () => null),
    notify: vi.fn(),
    openFull: vi.fn(),
    close: vi.fn(),
    config,
    theme: configThemeStore(config),
    onActivate: (cb: () => void) => {
      activateSubs.add(cb);
      return () => activateSubs.delete(cb);
    },
    now: () => NOW,
  } satisfies Host;
  render(<Palette host={host} registry={registry} />);
  return {
    host,
    clipboard: () => clipboard,
    setClipboard: (s: string) => (clipboard = s),
    activate: () => act(async () => activateSubs.forEach((cb) => cb())),
    input: () => screen.getByRole('combobox'),
    rows: () => screen.getAllByRole('option'),
    key: (key: string, init: Partial<KeyboardEventInit> & { code?: string } = {}) =>
      act(async () => {
        fireEvent.keyDown(screen.getByRole('combobox'), { key, ...init });
      }),
  };
}

const settle = () => act(async () => {});

afterEach(cleanup);

describe('Palette', () => {
  it('shows the clipboard strip and suggests JWT first (selected, enter badge)', async () => {
    const p = setup({ clipboard: JWT });
    await settle();
    expect(screen.getByText('JWT detected in clipboard')).toBeTruthy();
    expect(screen.getByText(/^eyJhbGciOiJIUzI1NiIs/)).toBeTruthy();
    expect(screen.getByText('SUGGESTED')).toBeTruthy();
    const [first] = p.rows();
    expect(first!.getAttribute('aria-selected')).toBe('true');
    expect(within(first!).getByText('JWT decode')).toBeTruthy();
    expect(within(first!).getByText('enter')).toBeTruthy();
    // non-selected, non-recent rows show their ctrl+N shortcut
    fireEvent.change(p.input(), { target: { value: 'json' } });
    expect(within(p.rows()[1]!).getByText('ctrl 2')).toBeTruthy();
  });

  it('Enter runs the tool on the clipboard, writes the result, records recent, notifies and closes', async () => {
    const p = setup({ clipboard: JWT });
    await settle();
    await p.key('Enter');
    expect(p.clipboard()).toContain('"name": "Çağrı"');
    expect(p.host.config.get().recent).toEqual({ ids: ['jwt'], used: [NOW.getTime() / 1000] });
    expect(p.host.notify).toHaveBeenCalledWith('Copied to clipboard');
    expect(p.host.close).toHaveBeenCalledOnce();
  });

  it('table results are copied as aligned text', async () => {
    const p = setup({ clipboard: '1700000000' });
    await settle();
    expect(within(p.rows()[0]!).getByText('Unix timestamp')).toBeTruthy();
    await p.key('Enter');
    expect(p.clipboard()).toMatch(/ISO 8601 \(UTC\)\s+2023-11-14T22:13:20\.000Z/);
  });

  it('a tool error shows a red line and keeps the palette open', async () => {
    const p = setup({ clipboard: '{"a":' });
    await settle();
    fireEvent.change(p.input(), { target: { value: 'json format' } });
    await p.key('Enter');
    expect(screen.getByRole('alert').textContent).toBe('Invalid JSON: unexpected end at line 1, column 6');
    expect(p.host.close).not.toHaveBeenCalled();
    expect(p.clipboard()).toBe('{"a":');
  });

  it('arrow keys move the selection; ctrl+N runs row N', async () => {
    const p = setup({ clipboard: 'aGVsbG8gS290aWxvIEtpdCE=', config: { recent: { ids: ['hash'], used: [0] } } });
    await settle();
    await p.key('ArrowDown');
    expect(p.rows()[1]!.getAttribute('aria-selected')).toBe('true');
    await p.key('ArrowUp');
    await p.key('ArrowUp');
    expect(p.rows()[0]!.getAttribute('aria-selected')).toBe('true');
    // first suggestion is Base64 (decode needed) — run it via ctrl+1 after switching mode with Alt+M
    expect(within(p.rows()[0]!).getByText('Base64')).toBeTruthy();
    await p.key('m', { altKey: true, code: 'KeyM' });
    await p.key('1', { ctrlKey: true });
    expect(p.clipboard()).toBe('hello Kotilo Kit!');
  });

  it('Tab opens inline options; Alt+hotkey cycles; Esc closes options first, then the palette', async () => {
    const p = setup({ clipboard: 'aGk=' });
    await settle();
    fireEvent.change(p.input(), { target: { value: 'base64' } });
    await p.key('Tab');
    const mode = screen.getByRole('group', { name: 'Mode' });
    expect(within(mode).getByRole('button', { name: 'Encode' }).getAttribute('aria-pressed')).toBe('true');
    await p.key('m', { altKey: true, code: 'KeyM' });
    expect(within(mode).getByRole('button', { name: 'Decode' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('alt m')).toBeTruthy();
    await p.key('Escape');
    expect(screen.queryByRole('group', { name: 'Mode' })).toBeNull();
    expect(p.host.close).not.toHaveBeenCalled();
    await p.key('Escape');
    expect(p.host.close).toHaveBeenCalledOnce();
  });

  it('ctrl+Enter opens the full window with the clipboard as input (cmd on macOS)', async () => {
    const p = setup({ clipboard: JWT, platform: 'mac' });
    await settle();
    expect(screen.getByText('⌘ ↵')).toBeTruthy();
    await p.key('Enter', { metaKey: true });
    expect(p.host.openFull).toHaveBeenCalledWith('jwt', JWT);
    expect(p.host.close).toHaveBeenCalledOnce();
  });

  it('asks for clipboard detection consent on first launch and lists all tools meanwhile', async () => {
    const p = setup({ clipboard: JWT, config: { clipboard: {} } });
    await settle();
    expect(screen.getByText('Detect clipboard content locally to suggest tools?')).toBeTruthy();
    expect(screen.getByText('ALL TOOLS')).toBeTruthy();
    expect(p.host.readClipboard).not.toHaveBeenCalled(); // nothing is read before consent
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes' })));
    expect(p.host.config.get().clipboard.detect).toBe(true);
    expect(screen.getByText('JWT detected in clipboard')).toBeTruthy();
  });

  it('with detection off: no strip, recent tools with relative times', async () => {
    const used = NOW.getTime() / 1000;
    setup({
      clipboard: JWT,
      config: { clipboard: { detect: false }, recent: { ids: ['csv', 'timestamp', 'json'], used: [used - 3 * 3600, used - 120, used - 3 * 3600] } },
    });
    await settle();
    expect(screen.queryByText(/detected in clipboard/)).toBeNull();
    expect(screen.getByText('RECENTLY USED')).toBeTruthy();
    expect(screen.getByText('2 min. ago')).toBeTruthy();
    expect(screen.getByText('today')).toBeTruthy(); // first row is selected → shows "enter" instead
  });

  it('search shows results; re-activation resets the query', async () => {
    const p = setup({ clipboard: '' });
    await settle();
    fireEvent.change(p.input(), { target: { value: 'sha' } });
    expect(screen.getByText('RESULTS')).toBeTruthy();
    expect(within(p.rows()[0]!).getByText('Hash')).toBeTruthy();
    fireEvent.change(p.input(), { target: { value: 'zzzzqqq' } });
    expect(screen.getByText('No matching tool')).toBeTruthy();
    await p.activate();
    expect((p.input() as HTMLInputElement).value).toBe('');
  });

  it('Turkish UI: uppercase section labels with İ/ı rules and TR footer', async () => {
    setup({ clipboard: JWT, config: { general: { ...defaultConfig().general, locale: 'tr' }, recent: { ids: ['csv'], used: [0] } } });
    await settle();
    expect(screen.getByText('ÖNERİLEN')).toBeTruthy();
    expect(screen.getByText('SON KULLANILAN')).toBeTruthy();
    expect(screen.getByText('Panoda JWT algılandı')).toBeTruthy();
    expect(screen.getByText('çalıştır ve panoya yaz')).toBeTruthy();
    expect(screen.getByText('Catppuccin Mocha')).toBeTruthy();
  });
});

describe('token rule', () => {
  // Colors only via var(--kit-*): no hex/rgb literals in kit-ui sources.
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../src');
  const files = readdirSync(dir).filter((f) => /\.(tsx?|css)$/.test(f));
  it.each(files)('%s', (f) => {
    const src = readFileSync(join(dir, f), 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![-\w])/);
    expect(src).not.toMatch(/\brgba?\(/);
  });
});
