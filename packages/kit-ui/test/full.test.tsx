// @vitest-environment jsdom
import { createRegistry, defaultConfig, type KitConfig } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullWindow, configThemeStore, groupTools, memoryConfigStore, utf8Length, type Host } from '../src/index.js';

const NOW = new Date('2026-11-07T12:00:00Z');
const registry = createRegistry(builtinTools);

function setup(opts: { config?: Partial<KitConfig>; platform?: Host['platform']; clipboard?: string; locale?: 'en' | 'tr' } = {}) {
  const base = defaultConfig({ locale: opts.locale ?? 'en' });
  const config = memoryConfigStore({ ...base, clipboard: { detect: true }, ...opts.config });
  let clipboard = opts.clipboard ?? '';
  let openFull: ((id: string, input: string) => void) | undefined;
  const controls = { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() };
  const host = {
    platform: opts.platform ?? 'windows',
    locale: opts.locale ?? 'en',
    readClipboard: vi.fn(async () => clipboard),
    writeClipboard: vi.fn(async (text: string) => {
      clipboard = text;
    }),
    saveFile: vi.fn(async () => {}),
    openFile: vi.fn(async () => new File(['hi'], 'a.txt')),
    notify: vi.fn(),
    openFull: vi.fn(),
    close: vi.fn(),
    config,
    theme: configThemeStore(config),
    onActivate: () => () => {},
    onOpenFull: (cb: (id: string, input: string) => void) => {
      openFull = cb;
      return () => {};
    },
    ...(opts.platform === 'mac' ? {} : { windowControls: controls }),
    now: () => NOW,
  } satisfies Host;
  render(<FullWindow host={host} registry={registry} version="0.1.0" />);
  return {
    host,
    controls,
    clipboard: () => clipboard,
    handOff: (id: string, input: string) => act(async () => openFull!(id, input)),
    input: () => screen.getByRole('textbox', { name: opts.locale === 'tr' ? 'Giriş' : 'Input' }) as HTMLTextAreaElement,
    type: (el: Element, value: string) => act(async () => void fireEvent.change(el, { target: { value } })),
    key: (init: KeyboardEventInit) => act(async () => void fireEvent.keyDown(window, init)),
  };
}

const settle = () => act(async () => {});
const output = () => document.querySelector('.kf-out, .kf-empty')!;

afterEach(cleanup);

describe('FullWindow', () => {
  it('renders the mockup chrome: brand, search, sidebar categories, status bar', () => {
    setup({ locale: 'tr' });
    expect(screen.getByText('Kotilo Kit')).toBeTruthy();
    expect(screen.getByPlaceholderText('Araç ara veya panodan yapıştır…')).toBeTruthy();
    // category headings upper-cased with tr-TR (i → İ)
    expect(screen.getByText('KODLAMA')).toBeTruthy();
    expect(screen.getByText('METİN')).toBeTruthy();
    expect(screen.getByText('çevrimdışı · ağ yok · telemetri yok')).toBeTruthy();
    expect(screen.getByText(`${registry.tools.length} araç · 0 eklenti`)).toBeTruthy();
    expect(screen.getByText('v0.1.0')).toBeTruthy();
    expect(screen.getByText('Catppuccin Mocha')).toBeTruthy();
    expect(screen.getByText('JetBrains Mono 13')).toBeTruthy();
  });

  it('opens the most recent tool first, otherwise the first tool', () => {
    setup({ config: { recent: { ids: ['jwt'], used: [1] } } });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('JWT decode');
    cleanup();
    setup();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(registry.tools[0]!.name.en);
  });

  it('shows the empty state, then runs the tool live as you type', async () => {
    const w = setup();
    expect(output().textContent).toBe('Paste or type something');
    await w.type(w.input(), 'İstanbul');
    await settle();
    expect(output().textContent).toBe('xLBzdGFuYnVs');
    expect(screen.getByText('text · 9 bytes · UTF-8')).toBeTruthy();
    expect(screen.getByText('12 characters')).toBeTruthy();
  });

  it('segmented option switches mode (aria-pressed) and alt+hotkey cycles it', async () => {
    const w = setup();
    await w.type(w.input(), 'aGk=');
    const decode = screen.getByRole('button', { name: 'Decode' });
    await act(async () => void fireEvent.click(decode));
    expect(decode.getAttribute('aria-pressed')).toBe('true');
    expect(output().textContent).toBe('hi');
    await w.key({ key: 'm', code: 'KeyM', altKey: true });
    expect(screen.getByRole('button', { name: 'Encode' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows tool errors as a red first line and marks the panel', async () => {
    const w = setup();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Decode' })));
    await w.type(w.input(), 'ab$d');
    expect(screen.getByRole('alert').textContent).toMatch(/^Invalid base64/);
    expect(document.querySelector('.kf-panel-error')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Copy' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('copies the output (button and ctrl+shift+C) and clears the input with ctrl+L', async () => {
    const w = setup();
    await w.type(w.input(), 'hi');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(w.clipboard()).toBe('aGk=');
    expect(w.host.notify).toHaveBeenCalledWith('Copied to clipboard');
    await w.type(w.input(), 'hey');
    await w.key({ key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true });
    await settle();
    expect(w.clipboard()).toBe('aGV5');
    await w.key({ key: 'l', code: 'KeyL', ctrlKey: true });
    expect(w.input().value).toBe('');
  });

  it('pastes from the clipboard into the input', async () => {
    const w = setup({ clipboard: 'paste me' });
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Paste' })));
    expect(w.input().value).toBe('paste me');
  });

  it('takes the palette hand-off (tool + input)', async () => {
    const w = setup();
    await w.handOff('json', '{"b":1}');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('JSON format');
    expect(w.input().value).toBe('{"b":1}');
  });

  it('suggests other tools that recognise the input and switches to them', async () => {
    const w = setup();
    await w.type(w.input(), '{"a":[1,2]}');
    await settle();
    const strip = document.querySelector('.kf-suggest') as HTMLElement;
    expect(within(strip).getByText('Input looks like JSON:')).toBeTruthy();
    await act(async () => void fireEvent.click(within(strip).getByText('JSON format')));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('JSON format');
    expect(document.querySelector('.kf-suggest a[href="#json"]')).toBeNull();
  });

  it('suggestion keeps the input; sidebar and search switches clear it', async () => {
    const w = setup();
    await w.type(w.input(), '{"a":1}');
    await settle();
    await act(async () => void fireEvent.click(within(document.querySelector('.kf-suggest') as HTMLElement).getByText('JSON format')));
    expect(w.input().value).toBe('{"a":1}');
    // re-selecting the current tool keeps it
    await act(async () => void fireEvent.click(screen.getByRole('link', { name: 'JSON format' })));
    expect(w.input().value).toBe('{"a":1}');
    await act(async () => void fireEvent.click(screen.getByRole('link', { name: 'URL parser' })));
    expect(w.input().value).toBe('');
    await w.type(w.input(), 'https://kotilo.dev');
    const search = screen.getByRole('textbox', { name: 'Search tools' });
    await w.type(search, 'cron');
    await act(async () => void fireEvent.keyDown(search, { key: 'Enter' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cron expression');
    expect(w.input().value).toBe('');
  });

  it('renders table layouts as a table', async () => {
    const w = setup();
    await act(async () => void fireEvent.click(screen.getByRole('link', { name: 'URL parser' })));
    await w.type(w.input(), 'https://kotilo.dev/a?x=1');
    await settle();
    const table = document.querySelector('.kf-out-table table')!;
    expect(table).toBeTruthy();
    expect(table.textContent).toContain('kotilo.dev');
    expect(screen.getByText(/rows$/)).toBeTruthy();
  });

  it('puts multiline text options in their own pane (diff B)', async () => {
    setup();
    await act(async () => void fireEvent.click(screen.getByRole('link', { name: 'Text diff' })));
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(3); // search + input + B
  });

  it('sidebar search filters tools; Enter opens the first match; ctrl+K focuses it', async () => {
    const w = setup();
    const search = screen.getByRole('textbox', { name: 'Search tools' });
    await w.key({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(document.activeElement).toBe(search);
    await w.type(search, 'cron');
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Cron expression']);
    await act(async () => void fireEvent.keyDown(search, { key: 'Enter' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cron expression');
  });

  it('pasting recognised content into search opens the matching tool with it as input', async () => {
    const w = setup();
    const search = screen.getByRole('textbox', { name: 'Search tools' });
    await act(async () => void fireEvent.paste(search, { clipboardData: { getData: () => '*/5 * * * *' } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cron expression');
    expect(w.input().value).toBe('*/5 * * * *');
  });

  it('send to tool moves the output into the input', async () => {
    const w = setup();
    await w.type(w.input(), 'hi');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Send to tool ›' })));
    expect(w.input().value).toBe('aGk=');
    // the next tool picked receives it
    await act(async () => void fireEvent.click(screen.getByRole('link', { name: 'URL parser' })));
    expect(w.input().value).toBe('aGk=');
    // only once: a further switch starts blank
    await act(async () => void fireEvent.click(screen.getByRole('link', { name: 'Cron expression' })));
    expect(w.input().value).toBe('');
  });

  it('theme button cycles to the next theme; caption buttons call the host', async () => {
    const w = setup();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Theme' })));
    expect(w.host.config.get().theme.id).not.toBe('catppuccin-mocha');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Minimize' })));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Close' })));
    expect(w.controls.minimize).toHaveBeenCalled();
    expect(w.controls.close).toHaveBeenCalled();
  });

  it('macOS has no drawn caption buttons (native traffic lights)', () => {
    setup({ platform: 'mac' });
    expect(screen.queryByRole('button', { name: 'Minimize' })).toBeNull();
    expect(screen.getByText('⌘ K')).toBeTruthy();
  });

  it('loads a file as input for tools that accept files', async () => {
    const w = setup();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'File' })));
    await settle();
    expect(screen.getByText('a.txt · 2 bytes')).toBeTruthy();
    expect(output().textContent).toBe('aGk=');
    expect(w.input().readOnly).toBe(true);
  });
});

describe('model helpers', () => {
  it('groupTools keeps catalog order and filters tr-TR aware', () => {
    const groups = groupTools(registry.tools, 'tr', 'İSTANBUL'.slice(0, 0));
    expect(groups.map((g) => g.category)).toEqual(['encoding', 'format', 'text', 'time', 'generate', 'web', 'visual']);
    const hits = groupTools(registry.tools, 'tr', 'ZAMAN').flatMap((g) => g.tools.map((t) => t.id));
    expect(hits).toContain('timestamp');
  });

  it('utf8Length counts bytes', () => {
    expect(utf8Length('aİ😀')).toBe(1 + 2 + 4);
  });
});
