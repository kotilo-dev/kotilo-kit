import {
  CATEGORIES,
  createContext,
  createRegistry,
  errorMessage,
  localeFromTag,
  resolveOptions,
  resultText,
  t,
  type Locale,
  type OptionDef,
  type Tool,
  type ToolResult,
} from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';

export const VERSION = '0.1.0';

export interface CliIO {
  stdin: Uint8Array;
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  env: Record<string, string | undefined>;
  /** Fallback locale tag when env has none (e.g. Intl default). */
  systemLocale?: string;
  now?: Date;
}

export interface CliResult {
  stdout: string | Uint8Array;
  stderr: string;
  code: number;
}

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
      } else if (a.startsWith('--no-')) {
        flags.set(a.slice(5), false);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags.set(a.slice(2), next);
          i++;
        } else flags.set(a.slice(2), true);
      }
    } else if (a === '-h') flags.set('help', true);
    else positionals.push(a);
  }
  return { positionals, flags };
}

/** `KOTILO_LANG`, then POSIX locale vars, then the system default. */
export function detectLocale(env: CliIO['env'], systemLocale?: string): Locale {
  const tag = env.KOTILO_LANG || env.LC_ALL || env.LC_MESSAGES || env.LANG || systemLocale;
  return localeFromTag(tag);
}

/** Global flags handled by the CLI itself, never passed to tools. */
const GLOBAL_FLAGS = new Set(['json', 'lang', 'help', 'tz', 'version']);

function camel(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function describeOption(tool: Tool<any>, opt: OptionDef, locale: Locale): string {
  const label = t(locale, `tool.${tool.id}.opt.${opt.key}`);
  let detail: string;
  if (opt.type === 'segmented' || opt.type === 'select') detail = opt.values.join('|');
  else if (opt.type === 'number') detail = `${opt.min ?? ''}..${opt.max ?? ''}`;
  else if (opt.type === 'toggle') detail = 'on/off';
  else detail = 'text';
  return `  --${opt.key.padEnd(18)} ${label}  [${detail}]  (${String(opt.default) || '""'})`;
}

function toolHelp(tool: Tool<any>, locale: Locale): string {
  const lines = [`${tool.name[locale]} — ${tool.description[locale]}`, '', `kotilo kit ${tool.id} [options] < input`];
  if (tool.options.length) {
    lines.push('', `${t(locale, 'cli.options')}:`, ...tool.options.map((o) => describeOption(tool, o, locale)));
  }
  if (tool.examples.length) {
    lines.push('', `${t(locale, 'cli.examples')}:`);
    for (const ex of tool.examples.slice(0, 3)) {
      const flags = Object.entries(ex.opts ?? {})
        .map(([k, v]) => (typeof v === 'boolean' ? (v ? `--${k}` : `--no-${k}`) : `--${k} ${JSON.stringify(String(v))}`))
        .join(' ');
      lines.push(`  echo ${JSON.stringify(ex.input)} | kotilo kit ${tool.id}${flags ? ' ' + flags : ''}`);
    }
  }
  return lines.join('\n') + '\n';
}

function listTools(tools: readonly Tool<any>[], locale: Locale): string {
  const out: string[] = [];
  for (const cat of CATEGORIES) {
    const inCat = tools.filter((x) => x.category === cat);
    if (!inCat.length) continue;
    out.push(t(locale, `category.${cat}`).toLocaleUpperCase(locale === 'tr' ? 'tr-TR' : 'en-US'));
    for (const tool of inCat) out.push(`  ${tool.id.padEnd(14)} ${tool.description[locale]}`);
    out.push('');
  }
  return out.join('\n');
}

function decodeInput(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** Map bare words after the tool id to segmented/select option values: `base64 decode` → `--mode decode`. */
function positionalOptions(tool: Tool<any>, words: string[], locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const w of words) {
    const opt = tool.options.find(
      (o) => (o.type === 'segmented' || o.type === 'select') && o.values.includes(w) && !(o.key in out),
    );
    if (!opt) throw new CliError(t(locale, 'cli.unknownOption', { tool: tool.id, key: w }));
    out[opt.key] = w;
  }
  return out;
}

class CliError extends Error {}

function render(result: ToolResult, io: CliIO, asJson: boolean): string | Uint8Array {
  if (asJson) {
    const { bytes, ...rest } = result;
    return JSON.stringify({ ...rest, ...(bytes ? { bytesLength: bytes.length } : {}) }, null, 2) + '\n';
  }
  if (result.bytes && !io.stdoutIsTTY) return result.bytes; // binary to a pipe/file: raw bytes
  const text = resultText(result);
  return text.endsWith('\n') || text === '' ? text : text + '\n';
}

export function runCli(argv: string[], io: CliIO): CliResult {
  const { positionals, flags } = parseArgs(argv);
  const langFlag = flags.get('lang');
  const locale = typeof langFlag === 'string' ? localeFromTag(langFlag) : detectLocale(io.env, io.systemLocale);
  const registry = createRegistry(builtinTools);
  const ok = (stdout: string | Uint8Array): CliResult => ({ stdout, stderr: '', code: 0 });
  const err = (msg: string, code = 1): CliResult => ({ stdout: '', stderr: msg.endsWith('\n') ? msg : msg + '\n', code });

  // tolerate the `kotilo kit <tool>` form when invoked as the full binary
  if (positionals[0] === 'kit') positionals.shift();
  const [command, ...rest] = positionals;

  if (flags.get('version')) return ok(`kotilo-kit ${VERSION}\n`);
  if (!command || command === 'help') return command || flags.get('help') ? ok(t(locale, 'cli.usage') + '\n') : err(t(locale, 'cli.usage'), 2);

  const input = io.stdinIsTTY ? '' : decodeInput(io.stdin);

  if (command === 'list') {
    if (flags.get('json')) {
      return ok(JSON.stringify(registry.tools.map((x) => ({ id: x.id, category: x.category, name: x.name[locale], description: x.description[locale] })), null, 2) + '\n');
    }
    return ok(listTools(registry.tools, locale));
  }

  if (command === 'detect') {
    const hits = registry.detect(input, { limit: 10, budgetMs: Infinity });
    if (flags.get('json')) return ok(JSON.stringify(hits.map((h) => ({ id: h.tool.id, score: h.score })), null, 2) + '\n');
    if (!hits.length) return { stdout: '', stderr: t(locale, 'cli.noDetection') + '\n', code: 1 };
    return ok(hits.map((h) => `${h.score.toFixed(2)}  ${h.tool.id.padEnd(14)} ${h.tool.name[locale]}`).join('\n') + '\n');
  }

  const tool = registry.get(command);
  if (!tool) return err(t(locale, 'cli.unknownTool', { id: command }), 2);
  if (flags.get('help')) return ok(toolHelp(tool, locale));

  try {
    const opts: Record<string, unknown> = positionalOptions(tool, rest, locale);
    for (const [rawKey, value] of flags) {
      if (GLOBAL_FLAGS.has(rawKey)) continue;
      const key = tool.options.find((o) => o.key === rawKey || o.key === camel(rawKey))?.key;
      if (!key) throw new CliError(t(locale, 'cli.unknownOption', { tool: tool.id, key: rawKey }));
      opts[key] = value;
    }
    const tzFlag = flags.get('tz');
    const ctx = createContext({
      locale,
      ...(io.now ? { now: io.now } : {}),
      ...(typeof tzFlag === 'string' ? { tz: tzFlag } : io.env.TZ ? { tz: io.env.TZ } : {}),
      ...(tool.accepts.includes('file') && !io.stdinIsTTY ? { bytes: io.stdin } : {}),
    });
    // text tools: a single trailing newline from `echo`/files is not part of the value
    const text = tool.accepts.includes('file') ? input : input.replace(/\r?\n$/, '');
    const result = tool.run(text, resolveOptions(tool.options, opts), ctx);
    return ok(render(result, io, flags.get('json') === true));
  } catch (e) {
    if (e instanceof CliError) return err(e.message, 2);
    return err(errorMessage(locale, e));
  }
}
