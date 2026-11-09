import {
  createRegistry,
  registryWithPipelines,
  stringifyPipeline,
  type LoadedPipeline,
  type OptionValues,
  type PipelineDef,
  type Registry,
  type Tool,
} from '@kotilo/kit-core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Host } from './host.js';

export const PIPELINE_NAME_RE = /^[a-z][a-z0-9-]*$/;

export interface Pipelines {
  /** Base tools plus every valid pipeline. */
  registry: Registry;
  /** Same, minus pipelines with `palette = false` (the palette's list). */
  paletteRegistry: Registry;
  /** Base tools only: pipeline steps can't be pipelines. */
  base: Registry;
  /** Every pipeline file, valid or not, in file order. */
  loaded: LoadedPipeline[];
  /** Whether this shell stores pipelines at all. */
  available: boolean;
  /** Write `def`; when renamed, the old file is removed after the new one is written. */
  save(def: PipelineDef, previousName?: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Write a raw source back (undo a delete). */
  restore(name: string, source: string): Promise<void>;
}

/** Load `<config>/pipelines` through the host and keep registries in sync with the files. */
export function usePipelines(host: Host, base: Registry): Pipelines {
  const store = host.pipelines;
  const [files, setFiles] = useState<{ file: string; source: string }[]>([]);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    const load = () =>
      void store
        .list()
        .then((f) => alive && setFiles(f))
        .catch((e) => console.warn('[kit] pipelines could not be read', e));
    load();
    const off = store.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [store]);

  const { registry, loaded } = useMemo(() => {
    if (!files.length) return { registry: base, loaded: [] as LoadedPipeline[] };
    const r = registryWithPipelines(base.tools, files);
    return { registry: r.registry, loaded: r.pipelines };
  }, [base, files]);

  const paletteRegistry = useMemo(() => {
    const hidden = new Set(loaded.filter((p) => p.def && !p.def.palette).map((p) => p.def!.name));
    return hidden.size ? createRegistry(registry.tools.filter((t) => !hidden.has(t.id))) : registry;
  }, [registry, loaded]);

  const save = useCallback(
    async (def: PipelineDef, previousName?: string) => {
      if (!store) return;
      await store.write(def.name, stringifyPipeline(def));
      if (previousName && previousName !== def.name) await store.remove(previousName);
    },
    [store],
  );
  const remove = useCallback(async (name: string) => void (await store?.remove(name)), [store]);
  const restore = useCallback(async (name: string, source: string) => void (await store?.write(name, source)), [store]);

  return { registry, paletteRegistry, base, loaded, available: Boolean(store), save, remove, restore };
}

/** Options that differ from the tool's defaults: what a step stores in TOML. */
export function changedOptions(tool: Tool<any>, opts: OptionValues): OptionValues {
  const out: OptionValues = {};
  for (const o of tool.options) {
    const v = opts[o.key];
    if (v !== undefined && v !== o.default) out[o.key] = v;
  }
  return out;
}

/** `base`, `base-2`, `base-3`… — the first name not in `taken`. */
export function uniqueName(base: string, taken: (name: string) => boolean): string {
  const stem = base.replace(/[^a-z0-9-]/g, '-').replace(/^[^a-z]+/, '') || 'pipeline';
  if (!taken(stem)) return stem;
  for (let i = 2; ; i++) if (!taken(`${stem}-${i}`)) return `${stem}-${i}`;
}

/** Problem with a name typed in the editor, as an i18n key, or null. */
export function nameProblem(name: string, pipelines: Pick<Pipelines, 'registry' | 'loaded'>, previousName?: string): string | null {
  if (!PIPELINE_NAME_RE.test(name)) return 'pipeline.nameInvalid';
  if (name !== previousName && (pipelines.registry.get(name) || pipelines.loaded.some((p) => p.name === name))) return 'pipeline.nameTaken';
  return null;
}
