// @vitest-environment jsdom
import { createRegistry, defaultConfig } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullWindow, Palette, changedOptions, configThemeStore, memoryConfigStore, memoryPipelineStore, nameProblem, uniqueName, type Host } from '../src/index.js';

const NOW = new Date('2026-11-09T12:00:00Z');
const registry = createRegistry(builtinTools);

const JWT_SCOPES = `name = "jwt-scopes"
palette = true

[[steps]]
tool = "base64"
opts = { mode = "decode" }

[[steps]]
tool = "json"
opts = { query = "$.scopes[*]" }
`;
const BROKEN = `name = "broken"

[[steps]]
tool = "nope"
`;

function makeHost(files: Record<string, string> = {}) {
  const config = memoryConfigStore(defaultConfig({ locale: 'en' }));
  const pipelines = memoryPipelineStore(files);
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
    pipelines,
    now: () => NOW,
  } satisfies Host;
  return { host, store: pipelines };
}

const settle = () => act(async () => {});
const type = (el: Element, value: string) => act(async () => void fireEvent.change(el, { target: { value } }));
const click = (el: Element) => act(async () => void fireEvent.click(el));

afterEach(cleanup);

describe('pipeline helpers', () => {
  it('changedOptions keeps only non-default values', () => {
    const b64 = registry.get('base64')!;
    expect(changedOptions(b64, { mode: 'decode', urlSafe: false })).toEqual({ mode: 'decode' });
  });
  it('uniqueName appends a counter', () => {
    const taken = new Set(['a', 'a-2']);
    expect(uniqueName('a', (n) => taken.has(n))).toBe('a-3');
    expect(uniqueName('b', (n) => taken.has(n))).toBe('b');
  });
  it('nameProblem rejects bad names and tool ids, allows renaming to itself', () => {
    const p = { registry, loaded: [] };
    expect(nameProblem('Bad Name', p)).toBe('pipeline.nameInvalid');
    expect(nameProblem('base64', p)).toBe('pipeline.nameTaken');
    expect(nameProblem('my-flow', p)).toBeNull();
  });
});

describe('FullWindow pipelines', () => {
  it('lists pipelines first with the PIPELINES heading and counts them in the status bar', async () => {
    const { host } = makeHost({ 'jwt-scopes': JWT_SCOPES });
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await settle();
    expect(screen.getByText('PIPELINES')).toBeTruthy();
    expect(screen.getByRole('link', { name: /jwt-scopes/ })).toBeTruthy();
    expect(screen.getByText(new RegExp(`${registry.tools.length} tools · 1 pipeline`))).toBeTruthy();
  });

  it('opens a pipeline in the editor and runs it live', async () => {
    const { host } = makeHost({ 'jwt-scopes': JWT_SCOPES });
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await settle();
    await click(screen.getByRole('link', { name: /jwt-scopes/ }));
    expect((screen.getByRole('textbox', { name: 'Pipeline name' }) as HTMLInputElement).value).toBe('jwt-scopes');
    const payload = btoa(JSON.stringify({ scopes: ['read', 'write'] }));
    await type(screen.getByRole('textbox', { name: 'Input' }), payload);
    await settle();
    const out = document.querySelector('.kf-out')!;
    expect(out.textContent).toContain('read');
    expect(out.textContent).toContain('write');
  });

  it('"Add to pipeline" → new pipeline seeds the editor with the tool; save writes TOML', async () => {
    const { host, store } = makeHost();
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await settle();
    await click(screen.getByRole('button', { name: /Add to pipeline/ }));
    const menu = screen.getByRole('menu');
    await click(menu.querySelector('.kf-menu-item')!);
    const name = screen.getByRole('textbox', { name: 'Pipeline name' }) as HTMLInputElement;
    await type(name, 'my-flow');
    await click(screen.getByRole('button', { name: 'Save' }));
    await settle();
    expect(store.files['my-flow']).toContain('name = "my-flow"');
    expect(store.files['my-flow']).toContain('[[steps]]');
  });

  it('refuses to save under a tool id', async () => {
    const { host, store } = makeHost();
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await settle();
    await click(screen.getByRole('button', { name: /Add to pipeline/ }));
    await click(screen.getByRole('menu').querySelector('.kf-menu-item')!);
    await type(screen.getByRole('textbox', { name: 'Pipeline name' }), 'base64');
    await click(screen.getByRole('button', { name: 'Save' }));
    await settle();
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    expect(store.files['base64']).toBeUndefined();
  });
});

describe('Settings › Pipelines', () => {
  it('shows valid and broken files; delete can be undone', async () => {
    const { host, store } = makeHost({ 'jwt-scopes': JWT_SCOPES, broken: BROKEN });
    render(<FullWindow host={host} registry={registry} version="1.1.0" />);
    await settle();
    await click(screen.getByRole('button', { name: 'Settings' }));
    await click(screen.getByRole('link', { name: 'Pipelines' }));
    expect(document.querySelectorAll('.kf-pipe-row')).toHaveLength(2);
    expect(document.querySelectorAll('.kf-pipe-row-error')).toHaveLength(1);
    await click(screen.getByRole('button', { name: /Delete pipeline jwt-scopes/ }));
    await settle();
    expect(store.files['jwt-scopes']).toBeUndefined();
    await click(screen.getByRole('button', { name: 'Undo' }));
    await settle();
    expect(store.files['jwt-scopes']).toBe(JWT_SCOPES);
  });
});

describe('Palette pipelines', () => {
  it('lists palette pipelines like tools', async () => {
    const hidden = JWT_SCOPES.replace('jwt-scopes', 'hidden-one').replace('palette = true', 'palette = false');
    const { host } = makeHost({ 'jwt-scopes': JWT_SCOPES, 'hidden-one': hidden });
    render(<Palette host={host} registry={registry} />);
    await settle();
    const search = screen.getByRole('combobox');
    await type(search, 'jwt-scopes');
    expect(screen.getAllByText('jwt-scopes').length).toBeGreaterThan(0);
    await type(search, 'hidden-one');
    expect(screen.queryByText('hidden-one')).toBeNull();
  });
});
