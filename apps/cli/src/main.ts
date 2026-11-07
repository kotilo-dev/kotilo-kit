import { readFileSync } from 'node:fs';
import { runCli } from './cli.js';

function readStdin(): Uint8Array {
  if (process.stdin.isTTY) return new Uint8Array();
  try {
    return readFileSync(0);
  } catch {
    return new Uint8Array(); // no stdin attached (e.g. some Windows shells)
  }
}

const result = runCli(process.argv.slice(2), {
  stdin: readStdin(),
  stdinIsTTY: Boolean(process.stdin.isTTY),
  stdoutIsTTY: Boolean(process.stdout.isTTY),
  env: process.env,
  systemLocale: Intl.DateTimeFormat().resolvedOptions().locale,
});

if (result.stderr) process.stderr.write(result.stderr);
if (typeof result.stdout === 'string' ? result.stdout : result.stdout.length) process.stdout.write(result.stdout);
process.exitCode = result.code;
