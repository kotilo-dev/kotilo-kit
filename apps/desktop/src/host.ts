import { defaultConfig, localeFromTag, parseConfig, stringifyConfig, type KitConfig } from '@kotilo/kit-core';
import { configThemeStore, type ConfigStore, type Host, type Platform } from '@kotilo/kit-ui';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  return 'linux';
}

const NODE_PLATFORM: Record<Platform, string> = { mac: 'darwin', windows: 'win32', linux: 'linux' };

/** Read config.toml through the Rust bridge; a broken file falls back to defaults instead of crashing. */
async function loadConfig(platform: Platform): Promise<KitConfig> {
  const defaults = defaultConfig({ locale: localeFromTag(navigator.language), platform: NODE_PLATFORM[platform] });
  try {
    return parseConfig(await invoke<string>('config_read'), defaults);
  } catch (e) {
    console.warn('[kit] config.toml could not be read, using defaults', e);
    return defaults;
  }
}

/**
 * ConfigStore persisted to config.toml. Every write is broadcast so the other windows
 * (palette / main / toast each have their own JS context) stay in sync.
 */
function tauriConfigStore(initial: KitConfig): ConfigStore {
  let current = initial;
  const subs = new Set<(c: KitConfig) => void>();
  const notify = () => subs.forEach((cb) => cb(current));
  void listen<string>('config:changed', (e) => {
    const text = e.payload;
    if (text === stringifyConfig(current)) return;
    current = parseConfig(text, current);
    notify();
  });
  return {
    get: () => current,
    async update(fn) {
      current = fn(current);
      notify();
      const text = stringifyConfig(current);
      await invoke('config_write', { contents: text });
      await emit('config:changed', text);
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

export async function createTauriHost(): Promise<Host> {
  const platform = detectPlatform();
  const config = tauriConfigStore(await loadConfig(platform));
  return {
    platform,
    locale: config.get().general.locale,
    // readText rejects when the clipboard is empty or holds non-text (image, files)
    readClipboard: () => readText().catch(() => ''),
    writeClipboard: (text) => writeText(text),
    saveFile: () => Promise.reject(new Error('saveFile: full window (K2)')),
    openFile: () => Promise.reject(new Error('openFile: full window (K2)')),
    notify: (message) => void invoke('notify', { message }),
    openFull: (toolId, input) => void invoke('open_full', { toolId, input }),
    close: () => void invoke('hide_window'),
    config,
    theme: configThemeStore(config),
    onActivate(cb) {
      const unlisten = listen('palette:show', () => cb());
      return () => void unlisten.then((f) => f());
    },
    now: () => new Date(),
  };
}
