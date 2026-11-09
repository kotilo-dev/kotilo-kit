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

  describe('pipelines', () => {
    const JWT_SCOPES = [
      'name = "jwt-scopes"',
      '[[steps]]',
      'tool = "base64"',
      'opts = { mode = "decode", urlSafe = true }',
      '[[steps]]',
      'tool = "json"',
      'opts = { query = "$.scopes[*]" }',
      '[[steps]]',
      'tool = "case"',
      'opts = { mode = "upper" }',
    ].join('\n');
    const payload = Buffer.from(JSON.stringify({ sub: '1', scopes: ['read', 'write', 'deploy'] })).toString('base64url');
    const files = [
      { file: '/cfg/pipelines/jwt-scopes.toml', source: JWT_SCOPES },
      { file: '/cfg/pipelines/gz.toml', source: '[[steps]]\ntool = "gzip"' },
    ];

    it('runs a pipeline by name, like a tool', () => {
      const r = runCli(['jwt-scopes'], io(payload + '\n', { pipelines: files }));
      expect(r.stderr).toBe('');
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout as string)).toEqual(['READ', 'WRITE', 'DEPLOY']);
    });

    it('list shows pipelines and reports skipped files on stderr', () => {
      const r = runCli(['list'], io('', { stdinIsTTY: true, pipelines: files }));
      expect(r.stdout).toContain('PIPELINES');
      expect(r.stdout).toMatch(/jwt-scopes\s+Base64 → JSON format → Case/);
      expect(r.stderr).toContain('Skipped pipeline /cfg/pipelines/gz.toml: Step 1: no tool named “gzip” is installed');
    });

    it('a broken pipeline explains itself instead of "unknown tool"', () => {
      const r = runCli(['gz'], io('x', { pipelines: files, env: { KOTILO_LANG: 'tr' } }));
      expect(r.code).toBe(1);
      expect(r.stderr).toBe('1. adım: “gzip” adlı araç yüklü değil\n');
    });

    it('a failing step names the step', () => {
      const r = runCli(['jwt-scopes'], io('bm90IGpzb24', { pipelines: files }));
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/^Step 2 \(JSON format\): Invalid JSON/);
    });
  });
});
