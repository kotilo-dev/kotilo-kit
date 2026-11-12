import type { KitConfig, Locale } from '@kotilo/kit-core';

export type Platform = 'mac' | 'windows' | 'linux';

export interface ConfigStore {
  get(): KitConfig;
  /** Apply `fn` and persist (config.toml). */
  update(fn: (config: KitConfig) => KitConfig): Promise<void>;
  subscribe(cb: (config: KitConfig) => void): () => void;
}

/** `<config>/pipelines/*.toml`. The shell does the file I/O; kit-ui parses and validates. */
export interface PipelineStore {
  list(): Promise<{ file: string; source: string }[]>;
  /** Write `<dir>/<name>.toml` (name is a tool-id-shaped pipeline name). */
  write(name: string, toml: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Another window (or this one) changed a pipeline file. */
  subscribe(cb: () => void): () => void;
  /** Reveal the folder in the OS file manager (Settings › Pipelines › Open folder). */
  openFolder?(): void;
  /** Display path of the folder, e.g. `~/.config/kotilo/kit/pipelines`. */
  dir?: string;
}

/** Same file operations over `<config>/tools/<name>.ts`. */
export type PluginStore = PipelineStore;

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
  /** Full window: a tool + input handed over from the palette (ctrl+Enter). Replays a pending one. */
  onOpenFull?(cb: (toolId: string, input: string) => void): () => void;
  /** User themes file (themes.toml next to config.toml). Absent = built-in themes only. */
  userThemes?: {
    read(): Promise<string>;
    write(toml: string): Promise<void>;
    /** Another window imported a theme. */
    subscribe(cb: () => void): () => void;
  };
  /** Pipelines folder. Absent = pipelines are not available in this shell. */
  pipelines?: PipelineStore;
  /** `tools/*.ts` plugin folder (names are file stems). Absent = no plugins in this shell. */
  plugins?: PluginStore;
  /** Shown in the settings status bar, e.g. `%APPDATA%\kotilo\kit\config.toml`. */
  configPath?: string;
  /** Frameless window controls (Windows/Linux full window). Absent = native title bar. */
  windowControls?: { minimize(): void; toggleMaximize(): void; close(): void };
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

/** In-memory PipelineStore — tests and previews. `files` maps name → TOML source. */
export function memoryPipelineStore(
  files: Record<string, string> = {},
  dir = '/cfg/pipelines',
  ext = '.toml',
): PipelineStore & { files: Record<string, string> } {
  const subs = new Set<() => void>();
  const changed = () => subs.forEach((cb) => cb());
  const store = {
    files: { ...files },
    dir,
    async list() {
      return Object.keys(store.files)
        .sort()
        .map((name) => ({ file: `${dir}/${name}${ext}`, source: store.files[name]! }));
    },
    async write(name: string, toml: string) {
      store.files[name] = toml;
      changed();
    },
    async remove(name: string) {
      delete store.files[name];
      changed();
    },
    subscribe(cb: () => void) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
  };
  return store;
}

/** In-memory PluginStore — tests and previews. `files` maps file stem → TypeScript source. */
export function memoryPluginStore(files: Record<string, string> = {}, dir = '/cfg/tools'): PluginStore & { files: Record<string, string> } {
  return memoryPipelineStore(files, dir, '.ts');
}
