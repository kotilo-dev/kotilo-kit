import { describe, expect, it } from 'vitest';
import { parseArgs, runCli, type CliIO } from '../src/cli.js';

const io = (stdin = '', extra: Partial<CliIO> = {}): CliIO => ({
  stdin: new TextEncoder().encode(stdin),
  stdinIsTTY: false,
  stdoutIsTTY: false,
  env: { LANG: 'en_US.UTF-8', TZ: 'UTC' },
  now: new Date('2026-01-01T00:00:00Z'),
  ...extra,
});

describe('parseArgs', () => {
  it('handles --k v, --k=v, --flag, --no-flag and --', () => {
    const { positionals, flags } = parseArgs(['base64', 'decode', '--wrap', '76', '--url-safe', '--no-x', '--a=b=c', '--', '--raw']);
    expect(positionals).toEqual(['base64', 'decode', '--raw']);
    expect(Object.fromEntries(flags)).toEqual({ wrap: '76', 'url-safe': true, x: false, a: 'b=c' });
  });
});

describe('runCli', () => {
  it('pnpm kit base64 decode < in.txt', () => {
    const r = runCli(['base64', 'decode'], io('aGVsbG8gS290aWxvIQ==\n'));
    expect(r).toEqual({ stdout: 'hello Kotilo!\n', stderr: '', code: 0 });
  });

  it('base64 encode keeps stdin bytes (like coreutils base64)', () => {
    expect(runCli(['base64'], io('hi\n')).stdout).toBe('aGkK\n');
  });

  it('kebab-case flags map to camelCase options', () => {
    expect(runCli(['base64', '--url-safe'], io('??>')).stdout).toBe('Pz8-\n');
  });

  it('strips a single trailing newline for text tools', () => {
    expect(runCli(['case', 'upper', '--lang', 'tr'], io('istanbul\n')).stdout).toBe('İSTANBUL\n');
  });

  it('kotilo kit <tool> form', () => {
    expect(runCli(['kit', 'url', 'decode'], io('a%20b')).stdout).toBe('a b\n');
  });

  it('renders tables as aligned text', () => {
    const r = runCli(['timestamp'], io('0'));
    expect(r.stdout).toContain('Unix (s)');
    expect(r.stdout).toMatch(/ISO 8601 \(UTC\)\s+1970-01-01T00:00:00\.000Z/);
  });

  it('--json emits result + meta', () => {
    const r = runCli(['json', 'minify', '--json'], io('{ "a": 1 }'));
    expect(JSON.parse(r.stdout as string)).toEqual({ output: '{"a":1}', mime: 'application/json', meta: { valid: true } });
  });

  it('writes raw bytes for binary output to a pipe, preview to a terminal', () => {
    const piped = runCli(['base64', 'decode'], io('/wD+'));
    expect(piped.stdout).toEqual(Uint8Array.of(0xff, 0x00, 0xfe));
    const tty = runCli(['base64', 'decode'], io('/wD+', { stdoutIsTTY: true }));
    expect(tty.stdout).toContain('3 bytes');
  });

  it('localized tool errors on stderr, exit 1', () => {
    const r = runCli(['base64', 'decode'], io('aGk*', { env: { LANG: 'tr_TR.UTF-8' } }));
    expect(r).toEqual({ stdout: '', stderr: 'Geçersiz base64: 4. karakter\n', code: 1 });
  });

  it('usage errors exit 2', () => {
    expect(runCli(['nope'], io()).code).toBe(2);
    expect(runCli(['base64', '--bogus', '1'], io()).code).toBe(2);
    expect(runCli(['base64', 'sideways'], io()).code).toBe(2);
    expect(runCli([], io()).code).toBe(2);
  });

  it('list and detect', () => {
    const list = runCli(['list'], io('', { stdinIsTTY: true, env: { KOTILO_LANG: 'tr' } }));
    expect(list.stdout).toContain('KODLAMA');
    expect(list.stdout).toContain('jwt');
    expect(runCli(['detect'], io('1700000000')).stdout).toMatch(/^0\.85\s+timestamp/);
    expect(runCli(['detect'], io('merhaba')).code).toBe(1);
  });

  it('--help per tool lists options with labels', () => {
    const r = runCli(['base64', '--help', '--lang', 'tr'], io('', { stdinIsTTY: true }));
    expect(r.stdout).toContain('Base64 kodla veya çöz');
    expect(r.stdout).toContain('--urlSafe');
    expect(r.stdout).toContain('URL-güvenli');
  });

  it('--tz overrides TZ', () => {
    expect(runCli(['timestamp', '--tz', 'Europe/Istanbul'], io('0')).stdout).toContain('1970-01-01 02:00:00 +02:00');
  });
});
