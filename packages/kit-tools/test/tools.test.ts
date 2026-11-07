import { createContext, runTool } from '@kotilo/kit-core';
import { describe, expect, it } from 'vitest';
import { base64Decode, base64Encode } from '../src/_lib/bytes.js';
import { locateJsonError } from '../src/_lib/json.js';
import { base64, hash, uuid, caseTool, lines } from '../src/index.js';
import { contrastRatio, parseColor } from '../src/visual/color.js';

let counter = 0;
const pseudoRandom = (n: number) => Uint8Array.from({ length: n }, () => (counter = (counter * 1103515245 + 12345) & 0x7fffffff) & 0xff);
const ctx = (extra: Parameters<typeof createContext>[0] = {}) =>
  createContext({ now: new Date('2026-11-07T12:00:00Z'), tz: 'UTC', random: pseudoRandom, ...extra });

describe('base64 helpers', () => {
  it('round-trips random bytes in both alphabets', () => {
    for (let len = 0; len < 64; len++) {
      const bytes = pseudoRandom(len);
      expect(base64Decode(base64Encode(bytes))).toEqual(bytes);
      expect(base64Decode(base64Encode(bytes, true))).toEqual(bytes);
    }
  });

  it('matches the platform encoder', () => {
    const bytes = pseudoRandom(100);
    expect(base64Encode(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    expect(base64Encode(bytes, true)).toBe(Buffer.from(bytes).toString('base64url'));
  });

  it('encodes file bytes from ctx.bytes instead of the text', () => {
    const bytes = Uint8Array.of(0xff, 0x00, 0xfe);
    expect(runTool(base64, 'ignored', {}, ctx({ bytes })).output).toBe('/wD+');
  });

  it('returns raw bytes for binary decode', () => {
    const r = runTool(base64, '/wD+', { mode: 'decode' }, ctx());
    expect(r.bytes).toEqual(Uint8Array.of(0xff, 0x00, 0xfe));
  });
});

describe('hash', () => {
  it('agrees with node:crypto on Turkish text and files', async () => {
    const { createHash, createHmac } = await import('node:crypto');
    const input = 'Iğdır, İzmir, ılık şırıl';
    for (const alg of ['md5', 'sha1', 'sha256', 'sha384', 'sha512'] as const) {
      expect(runTool(hash, input, { algorithm: alg }, ctx()).output).toBe(createHash(alg).update(input).digest('hex'));
      expect(runTool(hash, input, { algorithm: alg, hmacKey: 'anahtar' }, ctx()).output).toBe(
        createHmac(alg, 'anahtar').update(input).digest('hex'),
      );
    }
    const bytes = pseudoRandom(1000);
    expect(runTool(hash, '', { algorithm: 'sha256' }, ctx({ bytes })).output).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});

describe('uuid generation', () => {
  it('v4 has version and variant bits', () => {
    const out = runTool(uuid, '', { kind: 'v4', count: 50 }, ctx()).output as string;
    for (const id of out.split('\n')) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('v7 embeds ctx.now and sorts in generation order', () => {
    const ids = (runTool(uuid, '', { kind: 'v7', count: 20 }, ctx()).output as string).split('\n');
    expect(ids).toEqual([...ids].sort());
    expect(parseInt(ids[0]!.replace(/-/g, '').slice(0, 12), 16)).toBe(Date.parse('2026-11-07T12:00:00Z'));
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab]/);
  });

  it('ULID is 26 Crockford chars and decodes back to ctx.now', () => {
    const id = runTool(uuid, '', { kind: 'ulid' }, ctx()).output as string;
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(runTool(uuid, id, {}, ctx()).output).toContain('2026-11-07T12:00:00.000Z');
  });

  it('NanoID is 21 url-safe chars; uppercase does not apply', () => {
    const id = runTool(uuid, '', { kind: 'nanoid', uppercase: true }, ctx()).output as string;
    expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });

  it('count is clamped to 1..1000', () => {
    expect((runTool(uuid, '', { count: 5000 }, ctx()).output as string).split('\n')).toHaveLength(1000);
  });
});

describe('Turkish İ/ı correctness', () => {
  it.each([
    ['upper', 'ıiIİ', 'IİIİ'],
    ['lower', 'ıiIİ', 'ıiıi'],
    ['title', 'ırmak ili', 'Irmak İli'],
    ['snake', 'Işık İçin', 'ışık_için'],
  ] as const)('case %s (tr)', (mode, input, want) => {
    expect(runTool(caseTool, input, { mode, lang: 'tr' }, ctx()).output).toBe(want);
  });

  it('English mapping never produces dotted/dotless i', () => {
    expect(runTool(caseTool, 'iI', { mode: 'upper', lang: 'en' }, ctx()).output).toBe('II');
    expect(runTool(caseTool, 'iI', { mode: 'lower', lang: 'en' }, ctx()).output).toBe('ii');
  });

  it('collation puts ı before i and ş after s', () => {
    expect(runTool(lines, 'i\nı\nş\ns\nt', { lang: 'tr' }, ctx()).output).toBe('ı\ni\ns\nş\nt');
  });
});

describe('JSON error location', () => {
  it.each([
    ['{"a":1,}', 1, 8, 'trailingComma'],
    ['{\n  "a": 1\n  "b": 2\n}', 3, 3, 'unexpectedToken'],
    ['[1, 2', 1, 6, 'unexpectedEnd'],
    ['{"a": "x\ty"}', 1, 9, 'badString'],
    ['{"a": 01}', 1, 8, 'unexpectedToken'],
  ] as const)('%j → %i:%i %s', (src, line, column, reason) => {
    expect(locateJsonError(src)).toMatchObject({ line, column, reason });
  });
});

describe('color math', () => {
  it('Catppuccin Mocha text/base contrast ≥ 7:1', () => {
    expect(contrastRatio(parseColor('#cdd6f4')!, parseColor('#1e1e2e')!)).toBeGreaterThan(7);
  });

  it('parses oklch percentages and turn hues', () => {
    const c = parseColor('oklch(100% 0 0.5turn)')!;
    for (const ch of [c.r, c.g, c.b]) expect(ch).toBeCloseTo(1, 6);
  });
});
