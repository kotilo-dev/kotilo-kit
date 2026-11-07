import { defineTool, type RunContext } from '@kotilo/kit-core';
import { toHex } from '../_lib/bytes.js';

type Opts = { kind: 'v4' | 'v7' | 'ulid' | 'nanoid'; count: number; uppercase: boolean };

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const NANO_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

const fmtUuid = (b: Uint8Array) => {
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export function uuidV4(ctx: RunContext): string {
  const b = ctx.random(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return fmtUuid(b);
}

/** RFC 9562 v7: 48-bit Unix ms timestamp + random. `seq` keeps ids monotonic inside one batch. */
export function uuidV7(ctx: RunContext, ms: number): string {
  const b = ctx.random(16);
  for (let i = 0; i < 6; i++) b[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return fmtUuid(b);
}

export function ulid(ctx: RunContext, ms: number): string {
  let time = '';
  let t = ms;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32]! + time;
    t = Math.floor(t / 32);
  }
  const rnd = ctx.random(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += CROCKFORD[rnd[i]! & 31];
  return time + rand;
}

export function nanoid(ctx: RunContext, size = 21): string {
  let id = '';
  for (const byte of ctx.random(size)) id += NANO_ALPHABET[byte & 63];
  return id;
}

function inspect(input: string, ctx: RunContext): string | null {
  const s = input.trim();
  const iso = (ms: number) => new Date(ms).toISOString();
  if (UUID_RE.test(s)) {
    const hex = s.replace(/-/g, '').toLowerCase();
    const version = parseInt(hex[12]!, 16);
    const v = parseInt(hex[16]!, 16);
    const variant = v < 8 ? 'NCS' : v < 12 ? 'RFC 9562' : v < 14 ? 'Microsoft' : 'reserved';
    const lines = [`UUID  ${fmtUuid(Uint8Array.from(hex.match(/../g)!.map((x) => parseInt(x, 16))))}`];
    lines.push(`${ctx.t('tool.uuid.version')}: ${hex === '0'.repeat(32) ? 'nil' : version}`, `${ctx.t('tool.uuid.variant')}: ${variant}`);
    if (version === 7) lines.push(`${ctx.t('tool.uuid.time')}: ${iso(parseInt(hex.slice(0, 12), 16))}`);
    if (version === 1) {
      const ticks = BigInt(`0x${hex.slice(13, 16)}${hex.slice(8, 12)}${hex.slice(0, 8)}`);
      lines.push(`${ctx.t('tool.uuid.time')}: ${iso(Number((ticks - 122192928000000000n) / 10000n))}`);
    }
    return lines.join('\n');
  }
  if (ULID_RE.test(s)) {
    let ms = 0;
    for (const c of s.slice(0, 10).toUpperCase()) ms = ms * 32 + CROCKFORD.indexOf(c);
    return [`ULID  ${s.toUpperCase()}`, `${ctx.t('tool.uuid.time')}: ${iso(ms)}`].join('\n');
  }
  return null;
}

export default defineTool<Opts>({
  id: 'uuid',
  category: 'generate',
  name: { en: 'UUID / ULID', tr: 'UUID / ULID' },
  description: { en: 'Generate or inspect UUID v4/v7, ULID, NanoID', tr: 'UUID v4/v7, ULID, NanoID üret veya incele' },
  keywords: ['uuid', 'guid', 'ulid', 'nanoid', 'id', 'random', 'kimlik'],
  detect: (input) => (UUID_RE.test(input.trim()) ? 0.9 : ULID_RE.test(input.trim()) ? 0.7 : 0),
  options: [
    { key: 'kind', type: 'segmented', values: ['v4', 'v7', 'ulid', 'nanoid'], default: 'v4', hotkey: 'k' },
    { key: 'count', type: 'number', default: 1, min: 1, max: 1000 },
    { key: 'uppercase', type: 'toggle', default: false, hotkey: 'u' },
  ],
  run(input, opts, ctx) {
    // non-empty input that is an id → inspect it; anything else → generate
    const inspected = input.trim() ? inspect(input, ctx) : null;
    if (inspected) return { output: inspected, meta: { mode: 'inspect' } };

    const now = ctx.now.getTime();
    const ids: string[] = [];
    for (let i = 0; i < opts.count; i++) {
      const ms = now + i; // strictly increasing time keeps a v7/ULID batch sortable
      const id =
        opts.kind === 'v4' ? uuidV4(ctx) : opts.kind === 'v7' ? uuidV7(ctx, ms) : opts.kind === 'ulid' ? ulid(ctx, ms) : nanoid(ctx);
      ids.push(opts.uppercase && opts.kind !== 'nanoid' ? id.toUpperCase() : id);
    }
    return { output: ids.join('\n'), meta: { mode: 'generate', count: ids.length } };
  },
  examples: [],
});
