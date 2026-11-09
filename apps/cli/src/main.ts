import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '@kotilo/kit-core';
import { runCli } from './cli.js';

function readStdin(): Uint8Array {
  if (process.stdin.isTTY) return new Uint8Array();
  try {
    return readFileSync(0);
  } catch {
    return new Uint8Array(); // no stdin attached (e.g. some Windows shells)
  }
}

/** `<config>/pipelines/*.toml`; a missing folder simply means no pipelines. */
function readPipelines(): { file: string; source: string }[] {
  const dir = join(configDir(process.platform, process.env), 'pipelines');
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.toml')).sort();
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

const result = runCli(process.argv.slice(2), {
  stdin: readStdin(),
  stdinIsTTY: Boolean(process.stdin.isTTY),
  stdoutIsTTY: Boolean(process.stdout.isTTY),
  env: process.env,
  systemLocale: Intl.DateTimeFormat().resolvedOptions().locale,
  pipelines: readPipelines(),
});

if (result.stderr) process.stderr.write(result.stderr);
if (typeof result.stdout === 'string' ? result.stdout : result.stdout.length) process.stdout.write(result.stdout);
process.exitCode = result.code;
