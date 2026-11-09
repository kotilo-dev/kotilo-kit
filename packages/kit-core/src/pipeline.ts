import { parse, stringify } from 'smol-toml';
import { defineTool, resolveOptions } from './define.js';
import { ToolError, fail } from './errors.js';
import { errorMessage } from './i18n.js';
import { createRegistry, type Registry } from './registry.js';
import type { Layout, Locale, OptionValue, OptionValues, RunContext, TableOutput, Tool, ToolResult } from './types.js';

/**
 * A pipeline chains tools: each step's output is the next step's input.
 * Stored as `<config>/pipelines/<name>.toml`:
 *
 * ```toml
 * name = "jwt-scopes"
 * palette = true
 *
 * [[steps]]
 * tool = "base64"
 * opts = { mode = "decode", urlSafe = true }
 * ```
 */
export interface PipelineStep {
  tool: string;
  opts: OptionValues;
}

export interface PipelineDef {
  /** Also the pipeline's tool id: same shape as tool ids. */
  name: string;
  /** Listed in the palette (and the full window) like a tool. */
  palette: boolean;
  steps: PipelineStep[];
}

export interface PipelineIssue {
  /** 1-based step number; 0 = the pipeline as a whole. */
  step: number;
  code: string;
  params: Record<string, string | number>;
}

export interface StepResult {
  tool: string;
  result: ToolResult;
  ms: number;
}

export interface PipelineRun {
  result: ToolResult;
  steps: StepResult[];
}

const NAME_RE = /^[a-z][a-z0-9-]*$/;

const isOptionValue = (v: unknown): v is OptionValue =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

/**
 * Parse a pipeline file. `fallbackName` (the file stem) is used when the file has no `name`.
 * Throws a ToolError (`error.pipeline.*`) for malformed files; unknown tools are not checked here (see `validatePipeline`).
 */
export function parsePipeline(source: string, fallbackName?: string): PipelineDef {
  let raw: Record<string, unknown>;
  try {
    raw = parse(source) as Record<string, unknown>;
  } catch (e) {
    const detail = e instanceof Error ? (e.message.split('\n')[0] ?? e.message) : String(e);
    fail('error.pipeline.parse', { detail });
  }
  const name = typeof raw.name === 'string' && raw.name ? raw.name : (fallbackName ?? '');
  if (!NAME_RE.test(name)) fail('error.pipeline.badName', { name });
  const steps = raw.steps;
  if (!Array.isArray(steps) || steps.length === 0) fail('error.pipeline.noSteps');
  return {
    name,
    palette: typeof raw.palette === 'boolean' ? raw.palette : true,
    steps: steps.map((s, i) => {
      const step = (s ?? {}) as Record<string, unknown>;
      if (typeof step.tool !== 'string' || !step.tool) fail('error.pipeline.badStep', { step: i + 1 });
      const opts: OptionValues = {};
      if (step.opts !== undefined) {
        if (typeof step.opts !== 'object' || step.opts === null || Array.isArray(step.opts)) {
          fail('error.pipeline.badStep', { step: i + 1 });
        }
        for (const [k, v] of Object.entries(step.opts)) {
          if (!isOptionValue(v)) fail('error.pipeline.badStep', { step: i + 1 });
          opts[k] = v;
        }
      }
      return { tool: step.tool, opts };
    }),
  };
}

export function stringifyPipeline(def: PipelineDef): string {
  return (
    stringify({
      name: def.name,
      palette: def.palette,
      steps: def.steps.map((s) => (Object.keys(s.opts).length ? { tool: s.tool, opts: s.opts } : { tool: s.tool })),
    }) + '\n'
  );
}

/** Problems that keep a pipeline from running against `registry`: unknown tools or options, id clashes. */
export function validatePipeline(def: PipelineDef, registry: Registry): PipelineIssue[] {
  const issues: PipelineIssue[] = [];
  const own = registry.get(def.name);
  if (own && own.category !== 'pipeline') issues.push({ step: 0, code: 'error.pipeline.idTaken', params: { name: def.name } });
  def.steps.forEach((s, i) => {
    const step = i + 1;
    const tool = registry.get(s.tool);
    if (!tool || tool.category === 'pipeline') {
      issues.push({ step, code: 'error.pipeline.unknownTool', params: { step, tool: s.tool } });
      return;
    }
    for (const key of Object.keys(s.opts)) {
      if (!tool.options.some((o) => o.key === key)) {
        issues.push({ step, code: 'error.pipeline.unknownOption', params: { step, tool: s.tool, key } });
      }
    }
  });
  return issues;
}

/** Table output between steps becomes TSV (header + rows), which the CSV tool reads back. */
function tableToTsv(table: TableOutput): string {
  return [table.columns, ...table.rows].map((r) => r.join('\t')).join('\n');
}

/**
 * Run every step; returns the last result plus each intermediate one (the editor shows them).
 * A failing step throws `error.pipeline.step` naming the step and carrying the tool's own message.
 */
export function runPipeline(
  def: PipelineDef,
  registry: Registry,
  input: string,
  ctx: RunContext,
  clock: () => number = () => performance.now(),
): PipelineRun {
  const issues = validatePipeline(def, registry);
  if (issues.length) throw new ToolError(issues[0]!.code, issues[0]!.params);
  const steps: StepResult[] = [];
  let text = input;
  let bytes = ctx.bytes;
  def.steps.forEach((s, i) => {
    const tool = registry.get(s.tool)!;
    const stepCtx: RunContext = { ...ctx };
    if (bytes && tool.accepts.includes('file')) stepCtx.bytes = bytes;
    else delete stepCtx.bytes;
    const start = clock();
    let result: ToolResult;
    try {
      result = tool.run(text, resolveOptions(tool.options, s.opts), stepCtx);
    } catch (e) {
      throw new ToolError('error.pipeline.step', {
        step: i + 1,
        tool: tool.name[ctx.locale],
        detail: errorMessage(ctx.locale, e),
      });
    }
    steps.push({ tool: s.tool, result, ms: clock() - start });
    bytes = result.bytes;
    text = typeof result.output === 'string' ? result.output : tableToTsv(result.output);
  });
  return { result: steps[steps.length - 1]!.result, steps };
}

/** "Base64 → JSON → Case" in the given locale. */
export function describePipeline(def: PipelineDef, registry: Registry, locale: Locale): string {
  return def.steps.map((s) => registry.get(s.tool)?.name[locale] ?? s.tool).join(' → ');
}

/** Wrap a pipeline as a tool (`category: 'pipeline'`) so palette, full window and CLI treat it like any other. */
export function pipelineTool(def: PipelineDef, registry: Registry): Tool<OptionValues> {
  const first = registry.get(def.steps[0]!.tool);
  const last = registry.get(def.steps[def.steps.length - 1]!.tool);
  const layout: Layout = last?.layout === 'table' ? 'table' : 'input-output';
  return defineTool<OptionValues>({
    id: def.name,
    category: 'pipeline',
    name: { en: def.name, tr: def.name },
    description: { en: describePipeline(def, registry, 'en'), tr: describePipeline(def, registry, 'tr') },
    keywords: ['pipeline', ...def.steps.map((s) => s.tool)],
    layout,
    accepts: first?.accepts ?? ['text'],
    run(input, _opts, ctx) {
      const { result, steps } = runPipeline(def, registry, input, ctx);
      return { ...result, meta: { ...result.meta, steps: steps.length } };
    },
  });
}

export interface LoadedPipeline {
  /** File the definition came from (for messages and the settings list). */
  file: string;
  /** `def.name`, or the file stem when the file could not be parsed. */
  name: string;
  def?: PipelineDef;
  /** Parse error or validation issues; a pipeline with issues is not registered. */
  issues: PipelineIssue[];
}

/**
 * Registry of `tools` plus every valid pipeline among `files` (`{ file, source }`, e.g. read from
 * `<config>/pipelines/*.toml` by the shell). Pipelines reference built-in/plugin tools only, not other pipelines.
 */
export function registryWithPipelines(
  tools: readonly Tool<any>[],
  files: readonly { file: string; source: string }[],
): { registry: Registry; pipelines: LoadedPipeline[] } {
  const base = createRegistry(tools);
  const pipelines: LoadedPipeline[] = [];
  const added: Tool<any>[] = [];
  const names = new Set<string>();
  for (const { file, source } of files) {
    const stem = (file.split(/[\\/]/).pop() ?? file).replace(/\.toml$/i, '');
    let def: PipelineDef;
    try {
      def = parsePipeline(source, stem);
    } catch (e) {
      const issue = e instanceof ToolError ? { code: e.code, params: e.params } : { code: 'error.unexpected', params: { detail: String(e) } };
      pipelines.push({ file, name: stem, issues: [{ step: 0, ...issue }] });
      continue;
    }
    const issues = validatePipeline(def, base);
    if (!issues.length && names.has(def.name)) issues.push({ step: 0, code: 'error.pipeline.idTaken', params: { name: def.name } });
    pipelines.push({ file, name: def.name, def, issues });
    if (issues.length) continue;
    names.add(def.name);
    added.push(pipelineTool(def, base));
  }
  return { registry: added.length ? createRegistry([...tools, ...added]) : base, pipelines };
}

