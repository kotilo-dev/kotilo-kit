import { defineTool, fail } from '@kotilo/kit-core';

type Opts = { decode: boolean };

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i;

export default defineTool<Opts>({
  id: 'url-parse',
  category: 'web',
  name: { en: 'URL parser', tr: 'URL ayrıştırıcı' },
  description: { en: 'Split a URL into scheme, host, path and query', tr: 'URL’yi şema, host, yol ve sorgu parçalarına ayır' },
  keywords: ['url', 'uri', 'query', 'parse', 'ayrıştır', 'link'],
  layout: 'table',
  detect: (input) => (URL_RE.test(input.trim()) ? 0.85 : 0),
  options: [{ key: 'decode', type: 'toggle', default: true, hotkey: 'd' }],
  run(input, opts, ctx) {
    let url: URL;
    try {
      url = new URL(input.trim());
    } catch {
      fail('error.urlParse.invalid');
    }
    const dec = (s: string) => {
      if (!opts.decode) return s;
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    const label = (k: string) => ctx.t(`tool.url-parse.${k}`);
    const rows: string[][] = [
      [label('protocol'), url.protocol.replace(/:$/, '')],
      ...(url.username ? [[label('username'), dec(url.username)]] : []),
      ...(url.password ? [[label('password'), dec(url.password)]] : []),
      [label('hostname'), url.hostname],
      ...(url.port ? [[label('port'), url.port]] : []),
      [label('pathname'), dec(url.pathname)],
      ...(url.search ? [[label('search'), opts.decode ? dec(url.search) : url.search]] : []),
      ...(url.hash ? [[label('hash'), dec(url.hash)]] : []),
      [label('origin'), url.origin],
    ];
    let params = 0;
    for (const [k, v] of url.searchParams) {
      params++;
      // URLSearchParams already decodes; re-encode when the user asked for raw values
      rows.push([`?${opts.decode ? k : encodeURIComponent(k)}`, opts.decode ? v : encodeURIComponent(v)]);
    }
    return { output: { columns: [ctx.t('tool.url-parse.part'), ctx.t('tool.url-parse.value')], rows }, meta: { params } };
  },
  examples: [],
});
