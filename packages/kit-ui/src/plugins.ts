import { createRegistry, loadPlugins, type LoadedPlugin, type PluginSet, type Registry, type Tool } from '@kotilo/kit-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Host } from './host.js';

export interface Plugins {
  /** Built-in tools plus every enabled plugin that loaded. */
  registry: Registry;
  /** Every plugin file, loaded or not, in file order. */
  loaded: LoadedPlugin[];
  /** Enabled plugin tools (status bar count). */
  tools: Tool<any>[];
  disabled: ReadonlySet<string>;
  /** True until the first load finished. */
  loading: boolean;
  /** Whether this shell has a plugin folder at all. */
  available: boolean;
  setEnabled(id: string, on: boolean): Promise<void>;
  /** Delete the file; resolves to its source so Undo can put it back. */
  remove(file: string): Promise<string | undefined>;
  restore(file: string, source: string): Promise<void>;
  /** Read the folder and load everything again (Settings › "Reload"). */
  reload(): void;
}

/** `/x/tools/hexdump.ts` → `hexdump` (what PluginStore calls a name). */
export const pluginStem = (file: string) => (file.split(/[\\/]/).pop() ?? file).replace(/\.ts$/i, '');

/** Load `<config>/tools/*.ts` into the sandbox through the host; reloads when the folder changes. */
export function usePlugins(host: Host, base: Registry): Plugins {
  const store = host.plugins;
  const [disabledIds, setDisabledIds] = useState(() => host.config.get().plugins.disabled);
  useEffect(() => host.config.subscribe((c) => setDisabledIds(c.plugins.disabled)), [host]);
  const [set, setSet] = useState<PluginSet | null>(null);
  const [loading, setLoading] = useState(Boolean(store));
  const [generation, setGeneration] = useState(0);
  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => (store ? store.subscribe(reload) : undefined), [store, reload]);

  // the set in use is freed only after its replacement is in state (or on unmount)
  const live = useRef<PluginSet | null>(null);
  useEffect(() => () => live.current?.dispose(), []);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    const taken = new Set(base.tools.map((t) => t.id));
    void store
      .list()
      .then((files) => loadPlugins(files, { taken: (id) => taken.has(id) }))
      .then((s) => {
        if (!alive) return s.dispose();
        const old = live.current;
        live.current = s;
        setSet(s);
        old?.dispose();
      })
      .catch((e) => console.warn('[kit] plugins could not be loaded', e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [store, base, generation]);

  const disabled = useMemo(() => new Set<string>(disabledIds), [disabledIds]);
  const tools = useMemo(() => (set ? set.tools.filter((t) => !disabled.has(t.id)) : []), [set, disabled]);
  const registry = useMemo(() => (tools.length ? createRegistry([...base.tools, ...tools]) : base), [base, tools]);

  const setEnabled = useCallback(
    (id: string, on: boolean) =>
      host.config.update((c) => {
        const rest = c.plugins.disabled.filter((x) => x !== id);
        return { ...c, plugins: { disabled: on ? rest : [...rest, id] } };
      }),
    [host],
  );
  const remove = useCallback(
    async (file: string) => {
      if (!store) return undefined;
      const source = (await store.list().catch(() => [])).find((f) => f.file === file)?.source;
      await store.remove(pluginStem(file));
      return source;
    },
    [store],
  );
  const restore = useCallback(async (file: string, source: string) => void (await store?.write(pluginStem(file), source)), [store]);

  return {
    registry,
    loaded: set?.plugins ?? [],
    tools,
    disabled,
    loading,
    available: Boolean(store),
    setEnabled,
    remove,
    restore,
    reload,
  };
}
