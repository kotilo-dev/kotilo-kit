import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { KIT_TOOLS_BASE, configDir, defaultConfig, loadPlugins, localeFromTag, parseConfig, stringifyConfig, type KitConfig } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { runAdd } from './add.js';
import { detectLocale, parseArgs, runCli } from './cli.js';

function readStdin(): Uint8Array {
  if (process.stdin.isTTY) return new Uint8Array();
  try {
    return readFileSync(0);
  } catch {
    return new Uint8Array(); // no stdin attached (e.g. some Windows shells)
  }
}

const CONFIG_DIR = configDir(process.platform, process.env);

/** `<config>/<sub>/*.<ext>`; a missing folder simply means none. */
function readFiles(sub: string, ext: string): { file: string; source: string }[] {
  const dir = join(CONFIG_DIR, sub);
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith(ext)).sort();
  } catch {
    return [];
  }
  return names.flatMap((n) => {
    const file = join(dir, n);
    try {
      return [{ file, source: readFileSync(file, 'utf8') }];
    } catch {
      return [];
    }
  });
}

function disabledPlugins(): string[] {
  try {
    return parseConfig(readFileSync(join(CONFIG_DIR, 'config.toml'), 'utf8')).plugins.disabled;
  } catch {
    return [];
  }
}

/** Write via a temp file + rename so a crash never leaves half a file. */
function writeAtomic(file: string, contents: string) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, contents);
  renameSync(tmp, file);
}

/** The only network call in Kit: kit-tools files, after the user said yes (add.ts). */
async function kitToolsFetch(path: string): Promise<Uint8Array> {
  const res = await fetch(new URL(path, KIT_TOOLS_BASE), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return new Uint8Array(await res.arrayBuffer());
}

const ADD_FLAGS = new Set(['yes', 'force']);

async function add(argv: string[]): Promise<number> {
  const { positionals, flags } = parseArgs(argv, ADD_FLAGS);
  if (positionals[0] === 'kit') positionals.shift();
  const lang = flags.get('lang');
  const locale = typeof lang === 'string' ? localeFromTag(lang) : detectLocale(process.env, Intl.DateTimeFormat().resolvedOptions().locale);
  const configFile = join(CONFIG_DIR, 'config.toml');
  const toolPath = (id: string) => join(CONFIG_DIR, 'tools', `${id}.ts`);
  const interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY);
  return runAdd(positionals[1], { yes: flags.get('yes') === true, force: flags.get('force') === true }, {
    locale,
    interactive,
    async ask(question) {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    fetch: kitToolsFetch,
    readTool(id) {
      try {
        return readFileSync(toolPath(id), 'utf8');
      } catch {
        return undefined;
      }
    },
    writeTool(id, source) {
      mkdirSync(join(CONFIG_DIR, 'tools'), { recursive: true });
      writeAtomic(toolPath(id), source);
    },
    readConfig(): KitConfig {
      try {
        return parseConfig(readFileSync(configFile, 'utf8'), defaultConfig({ locale, platform: process.platform }));
      } catch {
        return defaultConfig({ locale, platform: process.platform });
      }
    },
    writeConfig(config) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeAtomic(configFile, stringifyConfig(config));
    },
    toolPath,
    out: (text) => void process.stdout.write(text),
    err: (text) => void process.stderr.write(text),
  });
}

// CJS bundle (tsup.config.ts): no top-level await
async function main() {
  const argv = process.argv.slice(2);
  const command = parseArgs(argv, ADD_FLAGS).positionals.filter((p, i) => !(i === 0 && p === 'kit'))[0];
  if (command === 'add') {
    process.exitCode = await add(argv);
    return;
  }

  const builtinIds = new Set(builtinTools.map((tool) => tool.id));
  // plugins run in the QuickJS sandbox; the wasm is only loaded when tools/ has files
  const plugins = await loadPlugins(readFiles('tools', '.ts'), { taken: (id) => builtinIds.has(id) });
  const result = runCli(argv, {
    stdin: readStdin(),
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    env: process.env,
    systemLocale: Intl.DateTimeFormat().resolvedOptions().locale,
    pipelines: readFiles('pipelines', '.toml'),
    plugins: plugins.plugins,
    disabledPlugins: disabledPlugins(),
  });
  plugins.dispose();

  if (result.stderr) process.stderr.write(result.stderr);
  if (typeof result.stdout === 'string' ? result.stdout : result.stdout.length) process.stdout.write(result.stdout);
  process.exitCode = result.code;
}

void main();
