import { describe, expect, it } from 'vitest';
import {
  ToolError,
  configDir,
  configPath,
  createRegistry,
  defaultConfig,
  defineTool,
  errorMessage,
  localeFromTag,
  parseConfig,
  pushRecent,
  resolveOptions,
  runTool,
  stringifyConfig,
  t,
  type OptionDef,
} from '../src/index.js';

const echo = defineTool<{ mode: 'a' | 'b'; n: number; on: boolean }>({
  id: 'echo',
  category: 'text',
  name: { en: 'Echo', tr: 'Yankı' },
  description: { en: 'Repeats input', tr: 'Girişi tekrarlar' },
  keywords: ['repeat'],
  detect: (s) => (s.startsWith('echo:') ? 0.7 : 0),
  options: [
    { key: 'mode', type: 'segmented', values: ['a', 'b'], default: 'a' },
    { key: 'n', type: 'number', default: 1, min: 1, max: 3 },
    { key: 'on', type: 'toggle', default: false },
  ],
  run: (input, o) => ({ output: `${o.mode}:${input.repeat(o.n)}:${o.on}` }),
});

describe('defineTool', () => {
  it('fills defaults', () => {
    expect(echo.layout).toBe('input-output');
    expect(echo.accepts).toEqual(['text']);
    expect(echo.examples).toEqual([]);
  });

  it('rejects bad ids, duplicate options and invalid defaults', () => {
    const base = { category: 'text' as const, name: { en: 'x', tr: 'x' }, description: { en: 'x', tr: 'x' }, run: () => ({ output: '' }) };
    expect(() => defineTool({ ...base, id: 'Bad Id' })).toThrow(/invalid id/);
    expect(() =>
      defineTool({ ...base, id: 'dup', options: [{ key: 'a', type: 'toggle', default: false }, { key: 'a', type: 'toggle', default: true }] }),
    ).toThrow(/duplicate/);
    expect(() => defineTool({ ...base, id: 'def', options: [{ key: 'm', type: 'segmented', values: ['x'], default: 'y' }] })).toThrow(/default/);
  });
});

describe('resolveOptions', () => {
  const opts: OptionDef[] = echo.options;
  it('coerces strings from CLI flags and clamps numbers', () => {
    expect(resolveOptions(opts, { mode: 'b', n: '9', on: 'true' })).toEqual({ mode: 'b', n: 3, on: true });
    expect(resolveOptions(opts, { mode: 'zzz', n: 'abc', on: 'no' })).toEqual({ mode: 'a', n: 1, on: false });
    expect(resolveOptions(opts, { unknown: 1 })).toEqual({ mode: 'a', n: 1, on: false });
  });

  it('runTool merges defaults', () => {
    expect(runTool(echo, 'x', { n: 2 }).output).toBe('a:xx:false');
  });
});

describe('i18n', () => {
  it('translates with params and falls back', () => {
    expect(t('tr', 'error.base64.invalidChar', { pos: 17 })).toBe('Geçersiz base64: 17. karakter');
    expect(t('en', 'error.base64.invalidChar', { pos: 17 })).toBe('Invalid base64: character 17');
    expect(t('tr', 'no.such.key')).toBe('no.such.key');
  });

  it('formats ToolErrors and unexpected errors without throwing', () => {
    expect(errorMessage('tr', new ToolError('error.time.tz', { tz: 'X' }))).toBe('Bilinmeyen saat dilimi: X');
    expect(errorMessage('en', new TypeError('boom'))).toBe('Unexpected error: boom');
  });

  it('picks locale from BCP-47 tags', () => {
    expect(localeFromTag('tr-TR')).toBe('tr');
    expect(localeFromTag('tr_TR.UTF-8')).toBe('tr');
    expect(localeFromTag('de-DE')).toBe('en');
    expect(localeFromTag(undefined)).toBe('en');
  });
});

describe('registry', () => {
  const other = defineTool({
    id: 'other',
    category: 'encoding',
    name: { en: 'Other', tr: 'Diğer' },
    description: { en: 'Something else', tr: 'Başka bir şey' },
    detect: () => {
      throw new Error('broken detector');
    },
    run: () => ({ output: '' }),
  });
  const registry = createRegistry([echo, other]);

  it('rejects duplicate ids', () => {
    expect(() => createRegistry([echo, echo])).toThrow(/duplicate/);
  });

  it('searches EN and TR names, keywords and categories', () => {
    expect(registry.search('yankı')[0]?.tool.id).toBe('echo');
    expect(registry.search('repeat')[0]?.tool.id).toBe('echo');
    expect(registry.search('diğer')[0]?.tool.id).toBe('other');
    expect(registry.search('kodlama')[0]?.tool.id).toBe('other');
  });

  it('empty query lists recent tools first', () => {
    expect(registry.search('', { recent: ['other'] }).map((h) => h.tool.id)).toEqual(['other', 'echo']);
  });

  it('detect ranks, limits and survives broken detectors', () => {
    const hits = registry.detect('echo: hi');
    expect(hits.map((h) => h.tool.id)).toEqual(['echo']);
    expect(registry.detect('   ')).toEqual([]);
  });
});

describe('config', () => {
  it('defaults when empty, platform-specific hotkey', () => {
    expect(parseConfig('')).toEqual(defaultConfig());
    expect(defaultConfig({ platform: 'darwin' }).general.hotkey).toBe('Cmd+Shift+K');
  });

  it('parses the documented example and clamps out-of-range values', () => {
    const cfg = parseConfig(`
[general]
locale = "tr"
hotkey = "Ctrl+Alt+K"
[clipboard]
detect = true
[theme]
id = "nord"
size = 40
palette_opacity = 10
radius = 12
[recent]
ids = ["jwt", "base64", "timestamp", "a", "b", "c", 3]
`);
    expect(cfg.general).toMatchObject({ locale: 'tr', hotkey: 'Ctrl+Alt+K' });
    expect(cfg.clipboard.detect).toBe(true);
    expect(cfg.theme).toMatchObject({ id: 'nord', size: 18, palette_opacity: 60, radius: 12, font: 'JetBrains Mono' });
    expect(cfg.recent.ids).toEqual(['jwt', 'base64', 'timestamp', 'a', 'b']);
  });

  it('round-trips through TOML', () => {
    const cfg = pushRecent(defaultConfig({ locale: 'tr' }), 'jwt');
    expect(parseConfig(stringifyConfig(cfg))).toEqual(cfg);
  });

  it('pushRecent dedupes and caps at 5', () => {
    let cfg = defaultConfig();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'b']) cfg = pushRecent(cfg, id);
    expect(cfg.recent.ids).toEqual(['b', 'f', 'e', 'd', 'c']);
  });

  it('resolves config paths per platform', () => {
    expect(configPath('win32', { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' })).toBe('C:\\Users\\u\\AppData\\Roaming\\kotilo\\kit\\config.toml');
    expect(configPath('linux', { HOME: '/home/u' })).toBe('/home/u/.config/kotilo/kit/config.toml');
    expect(configDir('linux', { HOME: '/home/u', XDG_CONFIG_HOME: '/xdg' })).toBe('/xdg/kotilo/kit');
    expect(configPath('darwin', { HOME: '/Users/u' })).toBe('/Users/u/.config/kotilo/kit/config.toml');
  });
});
