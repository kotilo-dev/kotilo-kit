import type { KitConfig, Locale } from '@kotilo/kit-core';

export type Platform = 'mac' | 'windows' | 'linux';

export interface ConfigStore {
  get(): KitConfig;
  /** Apply `fn` and persist (config.toml). */
  update(fn: (config: KitConfig) => KitConfig): Promise<void>;
  subscribe(cb: (config: KitConfig) => void): () => void;
}

export interface ThemeStore {
  id(): string;
  set(id: string): Promise<void>;
  subscribe(cb: (id: string) => void): () => void;
}

/**
 * Everything a shell (Tauri desktop, Kotilo Shell, Launcher) provides to kit-ui.
 * kit-ui never talks to the OS directly.
 */
export interface Host {
  platform: Platform;
  locale: Locale;
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;
  saveFile(name: string, data: Blob): Promise<void>;
  openFile(): Promise<File | null>;
  /** Short transient notice, e.g. "Copied to clipboard" (1.5 s). */
  notify(msg: string): void;
  /** Open the tool in the full window, carrying the input over. */
  openFull(toolId: string, input: string): void;
  /** Close (hide) the current window. */
  close(): void;
  config: ConfigStore;
  theme: ThemeStore;
  /** Fires every time the palette is shown: re-read the clipboard, reset the search. */
  onActivate(cb: () => void): () => void;
  now(): Date;
}

/** In-memory ConfigStore — tests and hosts without persistence. */
export function memoryConfigStore(initial: KitConfig, persist?: (c: KitConfig) => Promise<void>): ConfigStore {
  let current = initial;
  const subs = new Set<(c: KitConfig) => void>();
  return {
    get: () => current,
    async update(fn) {
      current = fn(current);
      subs.forEach((cb) => cb(current));
      await persist?.(current);
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

/** ThemeStore backed by `config.theme.id`. */
export function configThemeStore(config: ConfigStore): ThemeStore {
  return {
    id: () => config.get().theme.id,
    set: (id) => config.update((c) => ({ ...c, theme: { ...c.theme, id } })),
    subscribe: (cb) => config.subscribe((c) => cb(c.theme.id)),
  };
}
