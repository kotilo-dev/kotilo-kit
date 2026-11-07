import { defineTool, fail, type RunContext } from '@kotilo/kit-core';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js';
import { base64Decode, base64Encode, utf8DecodeStrict, utf8Encode } from '../_lib/bytes.js';
import { relativeTime } from '../_lib/text.js';

type Opts = { secret: string; secretEncoding: 'text' | 'base64' };

const JWT_RE = /^[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*$/;
const HMAC_ALGS = { HS256: sha256, HS384: sha384, HS512: sha512 } as const;
const TIME_CLAIMS = ['exp', 'nbf', 'iat', 'auth_time'] as const;

function decodePart(part: string, which: 'header' | 'payload'): Record<string, unknown> {
  try {
    const text = utf8DecodeStrict(base64Decode(part));
    const json = text === null ? null : JSON.parse(text);
    if (json && typeof json === 'object' && !Array.isArray(json)) return json as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  fail(`error.jwt.${which}`);
}

/** Constant-time compare of two strings (signature check). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function claimLine(key: string, value: unknown, ctx: RunContext): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  const delta = date.getTime() - ctx.now.getTime();
  const fmt = new Intl.DateTimeFormat(ctx.locale === 'tr' ? 'tr-TR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: ctx.tz,
  });
  let line = `${key.padEnd(9)} ${fmt.format(date)} (${relativeTime(delta, ctx.locale)})`;
  if (key === 'exp') line += delta <= 0 ? `  ✗ ${ctx.t('tool.jwt.expired')}` : `  ✓ ${ctx.t('tool.jwt.valid')}`;
  if (key === 'nbf' && delta > 0) line += `  ✗ ${ctx.t('tool.jwt.notYet')}`;
  return line;
}

export default defineTool<Opts>({
  id: 'jwt',
  category: 'encoding',
  name: { en: 'JWT decode', tr: 'JWT çöz' },
  description: { en: 'Decode a JWT and verify HS256 locally', tr: "JWT'yi çöz, HS256 imzasını yerelde doğrula" },
  keywords: ['jwt', 'token', 'bearer', 'jws', 'oauth', 'claims'],
  detect: (input) => (JWT_RE.test(input.trim().replace(/^Bearer\s+/i, '')) ? 0.95 : 0),
  options: [
    { key: 'secret', type: 'text', default: '', hotkey: 's' },
    { key: 'secretEncoding', type: 'segmented', values: ['text', 'base64'], default: 'text' },
  ],
  run(input, opts, ctx) {
    const token = input.trim().replace(/^Bearer\s+/i, '');
    const parts = token.split('.');
    if (parts.length !== 3 || !JWT_RE.test(token)) fail('error.jwt.format');
    const [h, p, s] = parts as [string, string, string];
    const header = decodePart(h, 'header');
    const payload = decodePart(p, 'payload');

    const lines: string[] = [];
    lines.push(`// ${ctx.t('tool.jwt.header')}`, JSON.stringify(header, null, 2), '');
    lines.push(`// ${ctx.t('tool.jwt.payload')}`, JSON.stringify(payload, null, 2), '');

    const claims = TIME_CLAIMS.flatMap((k) => claimLine(k, payload[k], ctx) ?? []);
    if (claims.length) lines.push(`// ${ctx.t('tool.jwt.claims')}`, ...claims, '');

    const alg = typeof header.alg === 'string' ? header.alg : '?';
    let verified: boolean | null = null;
    let sigLine: string;
    if (!opts.secret) {
      sigLine = ctx.t('tool.jwt.sigNoSecret', { alg });
    } else if (!(alg in HMAC_ALGS)) {
      sigLine = ctx.t('tool.jwt.sigUnsupported', { alg });
    } else {
      let key: Uint8Array;
      try {
        key = opts.secretEncoding === 'base64' ? base64Decode(opts.secret) : utf8Encode(opts.secret);
      } catch {
        fail('error.jwt.secret');
      }
      const mac = hmac(HMAC_ALGS[alg as keyof typeof HMAC_ALGS], key, utf8Encode(`${h}.${p}`));
      verified = safeEqual(base64Encode(mac, true), s);
      sigLine = verified ? `✓ ${ctx.t('tool.jwt.sigValid', { alg })}` : `✗ ${ctx.t('tool.jwt.sigInvalid', { alg })}`;
    }
    lines.push(`// ${ctx.t('tool.jwt.signature')}`, sigLine);

    const exp = typeof payload.exp === 'number' ? payload.exp * 1000 - ctx.now.getTime() : null;
    return {
      output: lines.join('\n'),
      mime: 'text/plain',
      meta: {
        alg,
        ...(exp !== null ? { expired: exp <= 0 } : {}),
        ...(verified !== null ? { verified } : {}),
      },
    };
  },
  examples: [],
});
