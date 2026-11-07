const encoder = new TextEncoder();

export const utf8Encode = (s: string): Uint8Array => encoder.encode(s);

/** Strict UTF-8 decode; returns null when the bytes are not valid UTF-8. */
export function utf8DecodeStrict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** True when decoded text is "readable": no control chars except tab/CR/LF. */
export function isPrintable(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F�]/.test(text);
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Classic `offset  hex  |ascii|` dump, used as a preview for binary outputs. */
export function hexDump(bytes: Uint8Array, maxBytes = 256): string {
  const lines: string[] = [];
  const n = Math.min(bytes.length, maxBytes);
  for (let off = 0; off < n; off += 16) {
    const chunk = bytes.subarray(off, Math.min(off + 16, n));
    const hex = [...chunk].map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = [...chunk].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  |${ascii}|`);
  }
  if (bytes.length > maxBytes) lines.push('…');
  return lines.join('\n');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64Encode(bytes: Uint8Array, urlSafe = false): string {
  const alpha = urlSafe ? B64URL : B64;
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += alpha[(n >> 18) & 63]! + alpha[(n >> 12) & 63]! + alpha[(n >> 6) & 63]! + alpha[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += alpha[(n >> 18) & 63]! + alpha[(n >> 12) & 63]! + (urlSafe ? '' : '==');
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += alpha[(n >> 18) & 63]! + alpha[(n >> 12) & 63]! + alpha[(n >> 6) & 63]! + (urlSafe ? '' : '=');
  }
  return out;
}

const DECODE = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) {
  DECODE[B64.charCodeAt(i)] = i;
  DECODE[B64URL.charCodeAt(i)] = i;
}

export class Base64Error extends Error {
  constructor(
    readonly reason: 'char' | 'length',
    /** 1-based position in the original string (for 'char'). */
    readonly position = 0,
  ) {
    super(reason);
  }
}

/** Decode standard or URL-safe base64; whitespace ignored, padding optional. */
export function base64Decode(input: string): Uint8Array {
  const clean: number[] = [];
  let padding = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) continue;
    if (c === 0x3d /* = */) {
      padding++;
      continue;
    }
    const v = c < 128 ? DECODE[c]! : -1;
    if (v < 0 || padding > 0) throw new Base64Error('char', i + 1);
    clean.push(v);
  }
  if (padding > 2 || clean.length % 4 === 1) throw new Base64Error('length');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (clean[i]! << 18) | ((clean[i + 1] ?? 0) << 12) | ((clean[i + 2] ?? 0) << 6) | (clean[i + 3] ?? 0);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out;
}

export const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
export const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
