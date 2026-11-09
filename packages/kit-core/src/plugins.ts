/**
 * User plugins (docs/03-architecture.md › Eklenti yükleme): `<config>/tools/*.ts`, one `defineTool`
 * per file. Sucrase strips the types, QuickJS-wasm runs the code in its own runtime — no network,
 * fs or DOM, a CPU deadline per call and a memory cap. Plugin code never runs in the host realm:
 * metadata crosses as JSON, `run`/`detect` are called through the sandbox.
 *
 * The shell reads the files; kit-core never touches the file system.
 */
import type { QuickJSContext, QuickJSHandle, QuickJSRuntime, QuickJSWASMModule } from 'quickjs-emscripten-core';
import { defineTool } from './define.js';
import { ToolError } from './errors.js';
import { clearPluginMessages, setPluginMessages, type Messages } from './i18n.js';
import { CATEGORIES, LOCALES, type Locale, type OptionDef, type RunContext, type Tool, type ToolResult } from './types.js';

/** Per-call CPU deadline for `run` (and for evaluating the module). */
export const PLUGIN_CPU_MS = 50;
/** Per-call deadline for `detect` (the registry runs every detector within 20 ms). */
export const PLUGIN_DETECT_MS = 5;
/** Memory cap of each plugin's runtime. */
export const PLUGIN_MEMORY_BYTES = 32 * 1024 * 1024;
/** Most bytes a plugin may ask `ctx.random` for in one call. */
const RANDOM_MAX = 64 * 1024;

export interface PluginFile {
  /** Full path, as the shell read it. */
  file: string;
  source: string;
}

export interface PluginIssue {
  code: string;
  params: Record<string, string | number>;
  /** `line:column` in the plugin file, when known. */
  loc?: string;
}

export interface LoadedPlugin {
  file: string;
  /** `tools/<name>.ts` — how Settings and the CLI refer to the file. */
  display: string;
  tool?: Tool<any>;
  error?: PluginIssue;
}

export interface PluginSet {
  plugins: LoadedPlugin[];
  /** Tools of the plugins that loaded. */
  tools: Tool<any>[];
  /** Free every plugin runtime (call before loading again). */
  dispose(): void;
}

export interface LoadOptions {
  /** Ids already taken (built-in tools, pipelines). */
  taken?: (id: string) => boolean;
}

const ID_RE = /^[a-z][a-z0-9-]*$/;
const LAYOUTS = ['input-output', 'single', 'table', 'preview'];
const OPTION_TYPES = ['segmented', 'select', 'toggle', 'number', 'text'];

let modulePromise: Promise<QuickJSWASMModule> | undefined;
/** The wasm module is loaded once, on first use (the palette never pays for it without plugins). */
function quickjs(): Promise<QuickJSWASMModule> {
  modulePromise ??= Promise.all([import('quickjs-emscripten-core'), import('@jitl/quickjs-singlefile-mjs-release-sync')]).then(
    ([core, variant]) => core.newQuickJSWASMModuleFromVariant(variant.default),
  );
  return modulePromise;
}

export function pluginDisplayName(file: string): string {
  return `tools/${file.split(/[\\/]/).pop() ?? file}`;
}

/** Load every plugin file. Never throws: a broken file becomes a `LoadedPlugin` with `error`. */
export async function loadPlugins(files: readonly PluginFile[], opts: LoadOptions = {}): Promise<PluginSet> {
  const sandboxes: Sandbox[] = [];
  const tables: [string, Partial<Record<Locale, Messages>> | undefined][] = [];
  const plugins: LoadedPlugin[] = [];
  if (!files.length) return { plugins, tools: [], dispose() {} };
  const [qjs, { transform }] = await Promise.all([quickjs(), import('sucrase')]);
  const seen = new Set<string>();

  for (const f of files) {
    const display = pluginDisplayName(f.file);
    const entry: LoadedPlugin = { file: f.file, display };
    plugins.push(entry);

    let code: string;
    try {
      code = transform(f.source, { transforms: ['typescript', 'imports'], disableESTransforms: true, production: true, filePath: display }).code;
    } catch (e) {
      const loc = (e as { loc?: { line: number; column: number } }).loc;
      const detail = (e instanceof Error ? e.message : String(e)).replace(/^Error transforming [^:]+: /, '').replace(/ \(\d+:\d+\)$/, '');
      entry.error = { code: 'error.plugin.syntax', params: { detail }, ...(loc ? { loc: `${loc.line}:${loc.column}` } : {}) };
      continue;
    }

    const runtime = qjs.newRuntime();
    runtime.setMemoryLimit(PLUGIN_MEMORY_BYTES);
    runtime.setMaxStackSize(1024 * 1024);
    const sandbox = new Sandbox(runtime, display);
    const loaded = sandbox.load(code);
    if ('error' in loaded) {
      entry.error = loaded.error;
      sandbox.dispose();
      continue;
    }
    const meta = validate(loaded.meta);
    if ('error' in meta) {
      entry.error = { ...meta.error, ...(loaded.loc ? { loc: loaded.loc } : {}) };
      sandbox.dispose();
      continue;
    }
    const id = meta.def.id as string;
    if (seen.has(id) || opts.taken?.(id)) {
      entry.error = { code: 'error.plugin.idTaken', params: { id } };
      sandbox.dispose();
      continue;
    }
    try {
      entry.tool = defineTool({
        ...meta.def,
        run: (input, o, ctx) => sandbox.run(input, o, ctx),
        ...(meta.hasDetect ? { detect: (input: string) => sandbox.detect(input) } : {}),
      } as Parameters<typeof defineTool>[0]);
    } catch (e) {
      entry.error = { code: 'error.plugin.invalid', params: { detail: e instanceof Error ? e.message : String(e) } };
      sandbox.dispose();
      continue;
    }
    seen.add(id);
    setPluginMessages(id, meta.messages);
    tables.push([id, meta.messages]);
    sandboxes.push(sandbox);
  }

  return {
    plugins,
    tools: plugins.flatMap((p) => (p.tool ? [p.tool] : [])),
    dispose() {
      for (const [id, table] of tables) clearPluginMessages(id, table);
      for (const s of sandboxes) s.dispose();
      sandboxes.length = 0;
    },
  };
}

/** Runs inside the sandbox before the plugin: `require` knows only `@kotilo/kit-core` (`defineTool`, `fail`). */
const PRELUDE = `
const __kit = { def: undefined, count: 0, loc: '' };
class KitFail { constructor(code, params) { this.code = String(code); this.params = params && typeof params === 'object' ? params : {}; } }
const __kitCore = Object.freeze({
  defineTool(def) {
    __kit.count++;
    __kit.def = def;
    // where the call is in the plugin file (skip the prelude's own frame)
    for (const line of String(new Error().stack || '').split('\\n')) {
      if (line.indexOf('kit-prelude') >= 0) continue;
      const m = line.match(/:(\\d+):(\\d+)\\)\\s*$/);
      if (m) { __kit.loc = m[1] + ':' + m[2]; break; }
    }
    return def;
  },
  fail(code, params) { throw new KitFail(code, params); },
});
globalThis.__kitRequire = function (name) {
  if (name === '@kotilo/kit-core') return __kitCore;
  throw new Error('import not allowed: ' + name);
};
globalThis.__kitMeta = function () {
  const d = __kit.def;
  if (__kit.count !== 1) return JSON.stringify({ count: __kit.count });
  if (d === null || typeof d !== 'object') return JSON.stringify({ count: 1, notObject: true });
  const shape = Object.assign({}, d, { run: typeof d.run, detect: typeof d.detect });
  return JSON.stringify({ count: 1, loc: __kit.loc, def: shape });
};
globalThis.__kitRun = function (input, optsJson, ctxJson, bytes) {
  const c = JSON.parse(ctxJson);
  const ctx = {
    locale: c.locale, now: new Date(c.now), tz: c.tz,
    random: (n) => new Uint8Array(__kitRandom(Number(n) || 0)),
    t: (key, params) => __kitT(String(key), JSON.stringify(params || {})),
  };
  if (bytes !== undefined) ctx.bytes = new Uint8Array(bytes);
  let r;
  try {
    r = __kit.def.run(input, JSON.parse(optsJson), ctx);
  } catch (e) {
    if (e instanceof KitFail) return [JSON.stringify({ fail: { code: e.code, params: e.params } })];
    throw e;
  }
  if (r === null || typeof r !== 'object') throw new TypeError('run() must return { output }');
  let buf;
  if (r.bytes instanceof Uint8Array) buf = r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength);
  return [JSON.stringify({ output: r.output, mime: r.mime, meta: r.meta }), buf];
};
globalThis.__kitDetect = function (input) {
  const s = Number(__kit.def.detect(input));
  return Number.isFinite(s) ? Math.min(1, Math.max(0, s)) : 0;
};
`;

type LoadResult = { meta: unknown; loc?: string } | { error: PluginIssue };

class Sandbox {
  private readonly vm: QuickJSContext;
  private ctx: RunContext | undefined;
  private dead = false;

  constructor(
    private readonly runtime: QuickJSRuntime,
    private readonly display: string,
  ) {
    this.vm = runtime.newContext();
    const vm = this.vm;
    vm.newFunction('__kitRandom', (n) => {
      const want = Math.min(RANDOM_MAX, Math.max(0, Math.floor(vm.getNumber(n))));
      const bytes = this.ctx ? this.ctx.random(want) : new Uint8Array(want);
      return vm.newArrayBuffer(bytes.slice().buffer);
    }).consume((fn) => vm.setProp(vm.global, '__kitRandom', fn));
    vm.newFunction('__kitT', (key, params) => {
      let p: Record<string, string | number> = {};
      try {
        p = JSON.parse(vm.getString(params)) as Record<string, string | number>;
      } catch {
        // keep empty params
      }
      return vm.newString(this.ctx ? this.ctx.t(vm.getString(key), p) : vm.getString(key));
    }).consume((fn) => vm.setProp(vm.global, '__kitT', fn));
  }

  private deadline(ms: number) {
    const end = Date.now() + ms;
    this.runtime.setInterruptHandler(() => Date.now() > end);
  }

  /** Evaluate the module, return what `defineTool` received (as JSON). */
  load(code: string): LoadResult {
    const vm = this.vm;
    const prelude = vm.evalCode(PRELUDE, 'kit-prelude.js');
    if (prelude.error) {
      prelude.error.dispose();
      return { error: { code: 'error.plugin.load', params: { detail: 'prelude' } } };
    }
    prelude.value.dispose();

    this.deadline(PLUGIN_CPU_MS);
    // same line numbers as the file: the wrapper sits on line 1 before the code
    const res = vm.evalCode(
      `(function (exports, require, module) {${code}\n})(globalThis.__kitExports = {}, globalThis.__kitRequire, { exports: globalThis.__kitExports });`,
      this.display,
    );
    this.runtime.removeInterruptHandler();
    if (res.error) {
      const err = this.dump(res.error);
      return { error: issueFrom(err, 'error.plugin.load', this.display) };
    }
    res.value.dispose();

    const meta = vm.evalCode('__kitMeta()');
    if (meta.error) {
      const err = this.dump(meta.error);
      return { error: issueFrom(err, 'error.plugin.load', this.display) };
    }
    const json = vm.getString(meta.value);
    meta.value.dispose();
    const parsed = JSON.parse(json) as { count: number; notObject?: boolean; loc?: string; def?: unknown };
    if (parsed.count === 0) return { error: { code: 'error.plugin.noTool', params: {} } };
    if (parsed.count > 1) return { error: { code: 'error.plugin.manyTools', params: { n: parsed.count } } };
    if (parsed.notObject) return { error: { code: 'error.plugin.invalid', params: { detail: 'defineTool(…) expects an object' } } };
    return { meta: parsed.def, ...(parsed.loc ? { loc: parsed.loc } : {}) };
  }

  run(input: string, opts: Record<string, unknown>, ctx: RunContext): ToolResult {
    if (this.dead) throw new ToolError('error.plugin.memory', { mb: PLUGIN_MEMORY_BYTES / 1024 / 1024 });
    const vm = this.vm;
    const args: QuickJSHandle[] = [
      vm.newString(input),
      vm.newString(JSON.stringify(opts)),
      vm.newString(JSON.stringify({ locale: ctx.locale, now: ctx.now.toISOString(), tz: ctx.tz })),
      ctx.bytes ? vm.newArrayBuffer(ctx.bytes.slice().buffer) : vm.undefined,
    ];
    const fn = vm.getProp(vm.global, '__kitRun');
    this.ctx = ctx;
    this.deadline(PLUGIN_CPU_MS);
    const res = vm.callFunction(fn, vm.undefined, ...args);
    this.runtime.removeInterruptHandler();
    this.ctx = undefined;
    fn.dispose();
    args.forEach((a) => a !== vm.undefined && a.dispose());

    if (res.error) throw this.runError(this.dump(res.error));
    const jsonH = vm.getProp(res.value, 0);
    const bufH = vm.getProp(res.value, 1);
    res.value.dispose();
    const out = JSON.parse(vm.getString(jsonH)) as {
      fail?: { code: string; params: Record<string, string | number> };
      output?: unknown;
      mime?: unknown;
      meta?: unknown;
    };
    jsonH.dispose();
    let bytes: Uint8Array | undefined;
    if (vm.typeof(bufH) === 'object') {
      const view = vm.getArrayBuffer(bufH);
      bytes = new Uint8Array(view.value);
      view.dispose();
    }
    bufH.dispose();

    if (out.fail) throw new ToolError(out.fail.code, sanitizeParams(out.fail.params));
    return toResult(out, bytes);
  }

  detect(input: string): number {
    if (this.dead) return 0;
    const vm = this.vm;
    const fn = vm.getProp(vm.global, '__kitDetect');
    const arg = vm.newString(input);
    this.deadline(PLUGIN_DETECT_MS);
    const res = vm.callFunction(fn, vm.undefined, arg);
    this.runtime.removeInterruptHandler();
    fn.dispose();
    arg.dispose();
    if (res.error) {
      const err = this.dump(res.error);
      if (/out of memory/i.test(err.message)) this.dead = true;
      return 0;
    }
    const score = vm.getNumber(res.value);
    res.value.dispose();
    return score;
  }

  private dump(h: QuickJSHandle): SandboxError {
    let v: unknown;
    try {
      v = this.vm.dump(h);
    } catch {
      v = { message: 'unknown error' };
    }
    h.dispose();
    const o = (v && typeof v === 'object' ? v : { message: String(v) }) as Partial<SandboxError>;
    return { name: String(o.name ?? 'Error'), message: String(o.message ?? v), stack: String(o.stack ?? '') };
  }

  private runError(err: SandboxError): ToolError {
    if (err.name === 'InternalError' && err.message === 'interrupted') return new ToolError('error.plugin.timeout', { ms: PLUGIN_CPU_MS });
    if (/out of memory/i.test(err.message)) {
      this.dead = true;
      return new ToolError('error.plugin.memory', { mb: PLUGIN_MEMORY_BYTES / 1024 / 1024 });
    }
    const loc = locOf(err.stack, this.display);
    return new ToolError('error.plugin.crashed', { detail: `${loc ? `${loc} ` : ''}${err.name}: ${err.message}` });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.vm.dispose();
      this.runtime.dispose();
    } catch {
      // a runtime that ran out of memory may refuse to free cleanly; nothing else to do
    }
  }
  private disposed = false;
}

interface SandboxError {
  name: string;
  message: string;
  stack: string;
}

function locOf(stack: string, display: string): string | undefined {
  const file = display.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = stack.match(new RegExp(`${file}:(\\d+)(?::(\\d+))?`));
  return m ? (m[2] ? `${m[1]}:${m[2]}` : m[1]) : undefined;
}

function issueFrom(err: SandboxError, code: string, display: string): PluginIssue {
  if (err.name === 'InternalError' && err.message === 'interrupted') return { code: 'error.plugin.timeout', params: { ms: PLUGIN_CPU_MS } };
  if (/out of memory/i.test(err.message)) return { code: 'error.plugin.memory', params: { mb: PLUGIN_MEMORY_BYTES / 1024 / 1024 } };
  const m = err.message.match(/^import not allowed: (.+)$/);
  if (m) return { code: 'error.plugin.import', params: { name: m[1]! } };
  return { code, params: { detail: `${err.name}: ${err.message}` }, ...withLoc(locOf(err.stack, display)) };
}

const withLoc = (loc: string | undefined) => (loc ? { loc } : {});

function sanitizeParams(p: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (p && typeof p === 'object')
    for (const [k, v] of Object.entries(p)) out[k] = typeof v === 'number' ? v : String(v);
  return out;
}

function toResult(out: { output?: unknown; mime?: unknown; meta?: unknown }, bytes: Uint8Array | undefined): ToolResult {
  let output: ToolResult['output'];
  const o = out.output as { columns?: unknown; rows?: unknown } | string | undefined;
  if (typeof o === 'string') output = o;
  else if (o && typeof o === 'object' && Array.isArray(o.columns) && Array.isArray(o.rows))
    output = { columns: o.columns.map(String), rows: o.rows.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)])) };
  else if (o === undefined && bytes) output = '';
  else throw new ToolError('error.plugin.crashed', { detail: 'run() must return { output: string | { columns, rows } }' });
  const result: ToolResult = { output };
  if (typeof out.mime === 'string') result.mime = out.mime;
  if (bytes) result.bytes = bytes;
  if (out.meta && typeof out.meta === 'object') result.meta = sanitizeParams(out.meta);
  return result;
}

// ---------- metadata validation (host side; the shape came out of the sandbox as JSON) ----------

type Validated =
  | { def: Record<string, unknown>; hasDetect: boolean; messages: Partial<Record<Locale, Messages>> | undefined }
  | { error: PluginIssue };

const missing = (field: string): { error: PluginIssue } => ({ error: { code: 'error.plugin.missingField', params: { field } } });
const invalid = (detail: string): { error: PluginIssue } => ({ error: { code: 'error.plugin.invalid', params: { detail } } });

function localized(v: unknown): Record<Locale, string> | undefined {
  if (typeof v === 'string' && v) return { en: v, tr: v };
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const en = typeof o.en === 'string' && o.en ? o.en : undefined;
  const tr = typeof o.tr === 'string' && o.tr ? o.tr : undefined;
  if (!en && !tr) return undefined;
  return { en: en ?? tr!, tr: tr ?? en! };
}

function validOption(o: unknown): string | null {
  if (!o || typeof o !== 'object') return 'option must be an object';
  const opt = o as Record<string, unknown>;
  if (typeof opt.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(opt.key)) return 'option "key" must be an identifier';
  if (!OPTION_TYPES.includes(opt.type as string)) return `option "${opt.key}": unknown type "${String(opt.type)}"`;
  if (opt.hotkey !== undefined && (typeof opt.hotkey !== 'string' || opt.hotkey.length !== 1)) return `option "${opt.key}": hotkey must be one letter`;
  switch (opt.type) {
    case 'segmented':
    case 'select':
      if (!Array.isArray(opt.values) || !opt.values.length || !opt.values.every((x) => typeof x === 'string'))
        return `option "${opt.key}": "values" must be a list of strings`;
      return typeof opt.default === 'string' ? null : `option "${opt.key}": "default" must be a string`;
    case 'toggle':
      return typeof opt.default === 'boolean' ? null : `option "${opt.key}": "default" must be true/false`;
    case 'number':
      for (const k of ['min', 'max', 'step']) if (opt[k] !== undefined && typeof opt[k] !== 'number') return `option "${opt.key}": "${k}" must be a number`;
      return typeof opt.default === 'number' ? null : `option "${opt.key}": "default" must be a number`;
    default:
      return typeof opt.default === 'string' ? null : `option "${opt.key}": "default" must be a string`;
  }
}

export function validate(raw: unknown): Validated {
  const d = (raw ?? {}) as Record<string, unknown>;
  if (d.id === undefined) return missing('id');
  if (typeof d.id !== 'string' || !ID_RE.test(d.id)) return invalid(`id "${String(d.id)}" must match ${ID_RE.source}`);
  const id = d.id;
  if (d.category === undefined) return missing('category');
  if (!CATEGORIES.includes(d.category as never)) return invalid(`unknown category "${String(d.category)}"`);
  const name = localized(d.name);
  if (!name) return missing('name');
  const description = localized(d.description);
  if (!description) return missing('description');
  if (d.run !== 'function') return missing('run');
  if (d.detect !== 'undefined' && d.detect !== 'function') return invalid('"detect" must be a function');
  if (d.layout !== undefined && !LAYOUTS.includes(d.layout as string)) return invalid(`unknown layout "${String(d.layout)}"`);
  if (d.accepts !== undefined && !(Array.isArray(d.accepts) && d.accepts.every((a) => a === 'text' || a === 'file')))
    return invalid('"accepts" must list "text" / "file"');
  if (d.keywords !== undefined && !(Array.isArray(d.keywords) && d.keywords.every((k) => typeof k === 'string')))
    return invalid('"keywords" must be a list of strings');
  if (d.options !== undefined && !Array.isArray(d.options)) return invalid('"options" must be a list');
  for (const o of (d.options as unknown[] | undefined) ?? []) {
    const problem = validOption(o);
    if (problem) return invalid(problem);
  }
  if (
    d.examples !== undefined &&
    !(Array.isArray(d.examples) && d.examples.every((e) => e && typeof e === 'object' && typeof e.input === 'string' && typeof e.output === 'string'))
  )
    return invalid('"examples" must be a list of { input, output }');

  // plugin strings (option labels, error messages) may only live under its own id
  let messages: Partial<Record<Locale, Messages>> | undefined;
  if (d.messages !== undefined) {
    if (!d.messages || typeof d.messages !== 'object') return invalid('"messages" must be { en: {…}, tr: {…} }');
    messages = {};
    for (const [loc, table] of Object.entries(d.messages as Record<string, unknown>)) {
      if (!LOCALES.includes(loc as Locale) || !table || typeof table !== 'object') return invalid(`"messages.${loc}" is not a locale table`);
      const clean: Messages = {};
      for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
        if (!k.startsWith(`tool.${id}.`) && !k.startsWith(`error.${id}.`)) return invalid(`message key "${k}" must start with tool.${id}. or error.${id}.`);
        if (typeof v !== 'string') return invalid(`message "${k}" must be a string`);
        clean[k] = v;
      }
      messages[loc as Locale] = clean;
    }
  }

  const def: Record<string, unknown> = {
    id,
    category: d.category,
    name,
    description,
    ...(d.keywords ? { keywords: d.keywords } : {}),
    ...(d.options ? { options: d.options as OptionDef[] } : {}),
    ...(d.layout ? { layout: d.layout } : {}),
    ...(d.accepts ? { accepts: d.accepts } : {}),
    ...(d.examples ? { examples: d.examples } : {}),
  };
  return { def, hasDetect: d.detect === 'function', messages };
}
