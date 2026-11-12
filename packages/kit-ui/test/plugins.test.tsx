// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRegistry, defaultConfig } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullWindow, Palette, configThemeStore, memoryConfigStore, memoryPipelineStore, memoryPluginStore, pluginStem, type Host } from '../src/index.js';

const registry = createRegistry(builtinTools);

const SHOUT = `import { defineTool } from '@kotilo/kit-core';
export default defineTool({
  id: 'shout',
  category: 'text',
  name: { en: 'Shout', tr: 'Bağır' },
  description: { en: 'Upper-case with a bang', tr: 'Büyük harf ve ünlem' },
  run: (s: string) => ({ output: s.trim().toUpperCase() + '!' }),
});
`;
const BROKEN = `import { defineTool } from '@kotilo/kit-core';\n\nexport default defineTool({ category: 'text', name: 'a', description: 'b', run: (s: string) => ({ output: s }) });\n`;

function makeHost(tools: Record<string, string>, pipelines: Record<string, string> = {}) {
  const config = memoryConfigStore(defaultConfig({ locale: 'en' }));
  const plugins = memoryPluginStore(tools);
  const host = {
    platform: 'windows',
    locale: 'en',
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
    plugins,
    pipelines: memoryPipelineStore(pipelines),
    now: () => new Date('2026-11-09T12:00:00Z'),
  } satisfies Host;
  return { host, store: plugins, config };
}

const click = (el: Element) => act(async () => void fireEvent.click(el));
const type = (el: Element, value: string) => act(async () => void fireEvent.change(el, { target: { value } }));
const pluginsLoaded = () => waitFor(() => expect(screen.getByRole('link', { name: /Shout/ })).toBeTruthy(), { timeout: 5000 });

afterEach(cleanup);

describe('pluginStem', () => {
  it('takes the file stem on both separators', () => {
    expect(pluginStem('C:\\cfg\\tools\\hex-dump.ts')).toBe('hex-dump');
    expect(pluginStem('/cfg/tools/slug.ts')).toBe('slug');
  });
});

describe('FullWindow plugins', () => {
  it('lists loaded plugins in their category, runs them, counts them', async () => {
    const { host } = makeHost({ shout: SHOUT, broken: BROKEN });
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await pluginsLoaded();
    expect(screen.getByText(`${registry.tools.length} tools · 1 plugins`)).toBeTruthy();
    await click(screen.getByRole('link', { name: /Shout/ }));
    await type(screen.getByRole('textbox', { name: 'Input' }), 'hey');
    await waitFor(() => expect(document.querySelector('.kf-out')!.textContent).toBe('HEY!'));
  });

  it('Settings › Plugins: summary, broken card with line, disable and remove + undo', async () => {
    const { host, store, config } = makeHost({ shout: SHOUT, broken: BROKEN });
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await pluginsLoaded();
    await click(screen.getByRole('button', { name: 'Settings' }));
    await click(screen.getByRole('link', { name: 'Plugins' }));
    expect(screen.getByText('1 enabled · 1 failed')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/^Could not load: 3:\d+ The defineTool call is missing “id”$/);
    expect(document.querySelectorAll('.kf-plugin-error')).toHaveLength(1);

    await click(screen.getByRole('checkbox', { name: 'Enabled' }));
    expect(config.get().plugins.disabled).toEqual(['shout']);
    expect(screen.getByText('0 enabled · 1 failed')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Shout/ })).toBeNull();

    await click(screen.getByRole('button', { name: 'Remove plugin Shout' }));
    expect(store.files.shout).toBeUndefined();
    await click(screen.getByRole('button', { name: 'Undo' }));
    expect(store.files.shout).toBe(SHOUT);
  });

  it('pipelines can use plugin tools', async () => {
    const { host } = makeHost({ shout: SHOUT }, { loud: 'name = "loud"\n[[steps]]\ntool = "shout"\n' });
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await pluginsLoaded();
    await waitFor(() => expect(screen.getByRole('link', { name: /loud/ })).toBeTruthy());
  });
});

describe('Palette plugins', () => {
  it('finds plugin tools', async () => {
    const { host } = makeHost({ shout: SHOUT });
    render(<Palette host={host} registry={registry} />);
    await type(screen.getByRole('combobox'), 'shout');
    await waitFor(() => expect(screen.getAllByText('Shout').length).toBeGreaterThan(0), { timeout: 5000 });
  });
});

// real kit-tools files (signed with the key built into kit-core), so the whole chain is checked offline
const KIT = join(import.meta.dirname, 'fixtures', 'kit-tools');
const kitFetch = vi.fn(async (path: string) => new Uint8Array(readFileSync(join(KIT, path))));
const SLUG_SOURCE = readFileSync(join(KIT, 'tools', 'slug.ts'), 'utf8');

async function openAdd(host: Host) {
  render(<FullWindow host={host} registry={registry} version="1.1.0" />);
  await click(screen.getByRole('button', { name: 'Settings' }));
  await click(screen.getByRole('link', { name: 'Plugins' }));
  await click(screen.getByRole('button', { name: 'Add from kit-tools…' }));
  return screen.getByRole('dialog', { name: 'Install a plugin from kit-tools' });
}

describe('kit add (Settings › Plugins)', () => {
  afterEach(() => kitFetch.mockClear());

  it('no kitTools in the host: no install button', async () => {
    const { host } = makeHost({});
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await click(screen.getByRole('button', { name: 'Settings' }));
    await click(screen.getByRole('link', { name: 'Plugins' }));
    expect(screen.queryByRole('button', { name: 'Add from kit-tools…' })).toBeNull();
  });

  it('consent first: nothing is fetched until "Connect and install"; then the signed tool is installed with its badge', async () => {
    const { host, store, config } = makeHost({});
    const dialog = await openAdd({ ...host, kitTools: { fetch: kitFetch } });
    expect(dialog.textContent).toContain('kotilo.dev/kit-tools');
    const confirm = screen.getByRole('button', { name: 'Connect and install' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await type(screen.getByRole('textbox', { name: 'Plugin' }), 'slug');
    expect(dialog.textContent).toContain('index.json · index.json.sig · tools/slug.ts');
    expect(kitFetch).not.toHaveBeenCalled();

    await click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(kitFetch.mock.calls.map(([p]) => p).sort()).toEqual(['index.json', 'index.json.sig', 'tools/slug.ts']);
    expect(store.files.slug).toBe(SLUG_SOURCE);
    expect(config.get().plugins.installed.slug?.version).toBe('1.0.0');
    expect(screen.getByRole('status').textContent).toBe('slug 1.0.0 installed from kit-tools.');
    await waitFor(() => expect(screen.getByText('kit-tools · signature verified')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('slug · 1.0.0')).toBeTruthy();
  });

  it('esc cancels without a request', async () => {
    const { host } = makeHost({});
    const dialog = await openAdd({ ...host, kitTools: { fetch: kitFetch } });
    await act(async () => void fireEvent.keyDown(dialog, { key: 'Escape' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(kitFetch).not.toHaveBeenCalled();
  });

  it('a local file with the same name is never overwritten', async () => {
    const mine = SHOUT.replace("'shout'", "'slug'");
    const { host, store } = makeHost({ slug: mine });
    await openAdd({ ...host, kitTools: { fetch: kitFetch } });
    await type(screen.getByRole('textbox', { name: 'Plugin' }), 'slug');
    await click(screen.getByRole('button', { name: 'Connect and install' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('tools/slug.ts already exists and was not installed from kit-tools. Remove it first.'));
    expect(store.files.slug).toBe(mine);
  });

  it('a tampered download installs nothing and says why', async () => {
    const { host, store, config } = makeHost({});
    const tampered = vi.fn(async (path: string) => (path.endsWith('.ts') ? new TextEncoder().encode(SLUG_SOURCE + '//x') : kitFetch(path)));
    await openAdd({ ...host, kitTools: { fetch: tampered } });
    await type(screen.getByRole('textbox', { name: 'Plugin' }), 'slug');
    await click(screen.getByRole('button', { name: 'Connect and install' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('tools/slug.ts does not match the signed list. Nothing was installed.'));
    expect(store.files.slug).toBeUndefined();
    expect(config.get().plugins.installed).toEqual({});
  });

  it('a local plugin file shows "local file" even with a stale install record', async () => {
    const { host, config } = makeHost({ shout: SHOUT });
    await config.update((c) => ({ ...c, plugins: { ...c.plugins, installed: { shout: { version: '1.0.0', sha256: '0'.repeat(64) } } } }));
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await pluginsLoaded();
    await click(screen.getByRole('button', { name: 'Settings' }));
    await click(screen.getByRole('link', { name: 'Plugins' }));
    expect(screen.getByText('local file')).toBeTruthy();
    expect(screen.queryByText('kit-tools · signature verified')).toBeNull();
  });
});
