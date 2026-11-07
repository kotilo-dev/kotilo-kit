import { defineTool, fail } from '@kotilo/kit-core';
import {
  BASE64_RE,
  BASE64URL_RE,
  Base64Error,
  base64Decode,
  base64Encode,
  hexDump,
  isPrintable,
  utf8DecodeStrict,
  utf8Encode,
} from '../_lib/bytes.js';

type Opts = { mode: 'encode' | 'decode'; urlSafe: boolean; wrap: number };

export function looksLikeBase64(input: string): number {
  const s = input.trim();
  if (s.length < 8 || s.length > 10_000_000) return 0;
  const compact = s.replace(/\s+/g, '');
  const std = BASE64_RE.test(compact) && compact.length % 4 === 0;
  const url = BASE64URL_RE.test(compact) && compact.length % 4 !== 1;
  if (!std && !url) return 0;
  // plain words / numbers / hex also fit the alphabet — require some base64 texture
  if (/^[0-9]+$/.test(compact) || /^[0-9a-fA-F]+$/.test(compact)) return 0;
  if (/^[a-zA-Z]+$/.test(compact) && !/[A-Z]/.test(compact.slice(1))) return 0;
  try {
    const text = utf8DecodeStrict(base64Decode(compact));
    return text !== null && isPrintable(text) ? 0.8 : 0.5;
  } catch {
    return 0;
  }
}

function wrapLines(s: string, width: number): string {
  if (width <= 0) return s;
  const out: string[] = [];
  for (let i = 0; i < s.length; i += width) out.push(s.slice(i, i + width));
  return out.join('\n');
}

export default defineTool<Opts>({
  id: 'base64',
  category: 'encoding',
  name: { en: 'Base64', tr: 'Base64' },
  description: { en: 'Encode or decode Base64', tr: 'Base64 kodla veya çöz' },
  keywords: ['b64', 'encode', 'decode', 'kodla', 'çöz'],
  detect: looksLikeBase64,
  options: [
    { key: 'mode', type: 'segmented', values: ['encode', 'decode'], default: 'encode', hotkey: 'm' },
    { key: 'urlSafe', type: 'toggle', default: false, hotkey: 'u' },
    { key: 'wrap', type: 'number', default: 0, min: 0, max: 200 },
  ],
  accepts: ['text', 'file'],
  run(input, opts, ctx) {
    if (opts.mode === 'encode') {
      const bytes = ctx.bytes ?? utf8Encode(input);
      const out = wrapLines(base64Encode(bytes, opts.urlSafe), opts.wrap);
      return { output: out, meta: { bytes: bytes.length } };
    }
    let bytes: Uint8Array;
    try {
      bytes = base64Decode(input);
    } catch (e) {
      if (e instanceof Base64Error && e.reason === 'char') fail('error.base64.invalidChar', { pos: e.position });
      fail('error.base64.invalidLength');
    }
    const text = utf8DecodeStrict(bytes);
    if (text !== null && isPrintable(text)) return { output: text, meta: { bytes: bytes.length } };
    return {
      output: `${ctx.t('tool.base64.binary', { bytes: bytes.length })}\n\n${hexDump(bytes)}`,
      bytes,
      mime: 'application/octet-stream',
      meta: { bytes: bytes.length },
    };
  },
  examples: [
    { input: 'hi', opts: { mode: 'encode' }, output: 'aGk=' },
    { input: 'aGk=', opts: { mode: 'decode' }, output: 'hi' },
    { input: 'İstanbul', opts: { mode: 'encode' }, output: 'xLBzdGFuYnVs' },
    { input: '??>', opts: { mode: 'encode', urlSafe: true }, output: 'Pz8-' },
  ],
});
