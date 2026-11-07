import { defineTool, fail } from '@kotilo/kit-core';

type Opts = { mode: 'encode' | 'decode'; scope: 'component' | 'full'; plusSpace: boolean };

export default defineTool<Opts>({
  id: 'url',
  category: 'encoding',
  name: { en: 'URL encode', tr: 'URL kodlama' },
  description: { en: 'Percent-encode or decode URLs', tr: 'URL yüzde kodla veya çöz' },
  keywords: ['percent', 'urlencode', 'uri', 'escape', '%20'],
  detect(input) {
    const s = input.trim();
    if (s.includes('\n')) return 0;
    const escapes = s.match(/%[0-9A-Fa-f]{2}/g)?.length ?? 0;
    return escapes >= 2 ? 0.75 : escapes === 1 ? 0.5 : 0;
  },
  options: [
    { key: 'mode', type: 'segmented', values: ['encode', 'decode'], default: 'encode', hotkey: 'm' },
    { key: 'scope', type: 'segmented', values: ['component', 'full'], default: 'component', hotkey: 's' },
    { key: 'plusSpace', type: 'toggle', default: false, hotkey: 'p' },
  ],
  run(input, opts) {
    if (opts.mode === 'encode') {
      let out = opts.scope === 'full' ? encodeURI(input) : encodeURIComponent(input);
      if (opts.plusSpace) out = out.replace(/%20/g, '+');
      return { output: out };
    }
    const src = opts.plusSpace ? input.replace(/\+/g, ' ') : input;
    try {
      return { output: opts.scope === 'full' ? decodeURI(src) : decodeURIComponent(src) };
    } catch {
      const bad = src.search(/%(?![0-9A-Fa-f]{2})/);
      fail('error.url.malformed', { pos: bad >= 0 ? bad + 1 : '?' });
    }
  },
  examples: [
    { input: 'a b&c=ç', opts: { mode: 'encode' }, output: 'a%20b%26c%3D%C3%A7' },
    { input: 'a%20b%26c%3D%C3%A7', opts: { mode: 'decode' }, output: 'a b&c=ç' },
    { input: 'https://x.dev/a b?q=ş', opts: { mode: 'encode', scope: 'full' }, output: 'https://x.dev/a%20b?q=%C5%9F' },
    { input: 'q=a+b', opts: { mode: 'decode', plusSpace: true }, output: 'q=a b' },
  ],
});
