import { defineTool, fail } from '@kotilo/kit-core';
import { hmac } from '@noble/hashes/hmac.js';
import { md5, sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { base64Encode, toHex, utf8Encode } from '../_lib/bytes.js';

const ALGS = ['all', 'md5', 'sha1', 'sha256', 'sha384', 'sha512', 'crc32'] as const;
type Alg = Exclude<(typeof ALGS)[number], 'all'>;
type Opts = { algorithm: (typeof ALGS)[number]; hmacKey: string; encoding: 'hex' | 'base64'; uppercase: boolean };

const FNS = { md5, sha1, sha256, sha384, sha512 } as const;
const LABEL: Record<Alg, string> = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512', crc32: 'CRC32' };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): Uint8Array {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  c = (c ^ 0xffffffff) >>> 0;
  return Uint8Array.of(c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255);
}

export default defineTool<Opts>({
  id: 'hash',
  category: 'generate',
  name: { en: 'Hash', tr: 'Hash' },
  description: { en: 'MD5, SHA-1/256/384/512, CRC32 and HMAC', tr: 'MD5, SHA-1/256/384/512, CRC32 ve HMAC' },
  keywords: ['md5', 'sha', 'sha256', 'sha1', 'crc', 'hmac', 'checksum', 'özet'],
  options: [
    { key: 'algorithm', type: 'select', values: ALGS, default: 'all', hotkey: 'a' },
    { key: 'hmacKey', type: 'text', default: '', hotkey: 'k' },
    { key: 'encoding', type: 'segmented', values: ['hex', 'base64'], default: 'hex', hotkey: 'e' },
    { key: 'uppercase', type: 'toggle', default: false, hotkey: 'u' },
  ],
  accepts: ['text', 'file'],
  run(input, opts, ctx) {
    const data = ctx.bytes ?? utf8Encode(input);
    const key = opts.hmacKey ? utf8Encode(opts.hmacKey) : null;
    if (key && opts.algorithm === 'crc32') fail('error.hash.hmacCrc');
    const algs: Alg[] = opts.algorithm === 'all' ? (key ? ['md5', 'sha1', 'sha256', 'sha384', 'sha512'] : ['md5', 'sha1', 'sha256', 'sha384', 'sha512', 'crc32']) : [opts.algorithm];

    const digest = (alg: Alg) => {
      const raw = alg === 'crc32' ? crc32(data) : key ? hmac(FNS[alg], key, data) : FNS[alg](data);
      const s = opts.encoding === 'hex' ? toHex(raw) : base64Encode(raw);
      return opts.uppercase && opts.encoding === 'hex' ? s.toUpperCase() : s;
    };
    const prefix = key ? 'HMAC-' : '';
    const output =
      algs.length === 1 ? digest(algs[0]!) : algs.map((a) => `${(prefix + LABEL[a]).padEnd(13)} ${digest(a)}`).join('\n');
    return { output, meta: { bytes: data.length } };
  },
  examples: [
    { input: 'abc', opts: { algorithm: 'md5' }, output: '900150983cd24fb0d6963f7d28e17f72' },
    { input: 'abc', opts: { algorithm: 'sha256' }, output: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
    { input: '123456789', opts: { algorithm: 'crc32' }, output: 'cbf43926' },
    { input: 'The quick brown fox jumps over the lazy dog', opts: { algorithm: 'sha256', hmacKey: 'key' }, output: 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8' },
    { input: 'ğüşiöç', opts: { algorithm: 'sha1' }, output: '99021def5fe0078c56b03d4984415e589e3792a2' },
  ],
});
