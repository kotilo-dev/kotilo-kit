import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir, loadPlugins, parseConfig } from '@kotilo/kit-core';
import { builtinTools } from '@kotilo/kit-tools';
import { runCli } from './cli.js';

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

// CJS bundle (tsup.config.ts): no top-level await
async function main() {
  const builtinIds = new Set(builtinTools.map((tool) => tool.id));
  // plugins run in the QuickJS sandbox; the wasm is only loaded when tools/ has files
  const plugins = await loadPlugins(readFiles('tools', '.ts'), { taken: (id) => builtinIds.has(id) });
  const result = runCli(process.argv.slice(2), {
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
