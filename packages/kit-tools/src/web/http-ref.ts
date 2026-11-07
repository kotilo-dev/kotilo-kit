import { defineTool } from '@kotilo/kit-core';

type Opts = { table: 'status' | 'mime' };

/** Standard HTTP status codes (IANA registry + 418) with their reason phrases. Descriptions: i18n `tool.http-ref.status.<code>`. */
const STATUS: readonly [number, string][] = [
  [100, 'Continue'],
  [101, 'Switching Protocols'],
  [102, 'Processing'],
  [103, 'Early Hints'],
  [200, 'OK'],
  [201, 'Created'],
  [202, 'Accepted'],
  [203, 'Non-Authoritative Information'],
  [204, 'No Content'],
  [205, 'Reset Content'],
  [206, 'Partial Content'],
  [207, 'Multi-Status'],
  [208, 'Already Reported'],
  [226, 'IM Used'],
  [300, 'Multiple Choices'],
  [301, 'Moved Permanently'],
  [302, 'Found'],
  [303, 'See Other'],
  [304, 'Not Modified'],
  [305, 'Use Proxy'],
  [307, 'Temporary Redirect'],
  [308, 'Permanent Redirect'],
  [400, 'Bad Request'],
  [401, 'Unauthorized'],
  [402, 'Payment Required'],
  [403, 'Forbidden'],
  [404, 'Not Found'],
  [405, 'Method Not Allowed'],
  [406, 'Not Acceptable'],
  [407, 'Proxy Authentication Required'],
  [408, 'Request Timeout'],
  [409, 'Conflict'],
  [410, 'Gone'],
  [411, 'Length Required'],
  [412, 'Precondition Failed'],
  [413, 'Content Too Large'],
  [414, 'URI Too Long'],
  [415, 'Unsupported Media Type'],
  [416, 'Range Not Satisfiable'],
  [417, 'Expectation Failed'],
  [418, "I'm a teapot"],
  [421, 'Misdirected Request'],
  [422, 'Unprocessable Content'],
  [423, 'Locked'],
  [424, 'Failed Dependency'],
  [425, 'Too Early'],
  [426, 'Upgrade Required'],
  [428, 'Precondition Required'],
  [429, 'Too Many Requests'],
  [431, 'Request Header Fields Too Large'],
  [451, 'Unavailable For Legal Reasons'],
  [500, 'Internal Server Error'],
  [501, 'Not Implemented'],
  [502, 'Bad Gateway'],
  [503, 'Service Unavailable'],
  [504, 'Gateway Timeout'],
  [505, 'HTTP Version Not Supported'],
  [506, 'Variant Also Negotiates'],
  [507, 'Insufficient Storage'],
  [508, 'Loop Detected'],
  [510, 'Not Extended'],
  [511, 'Network Authentication Required'],
];

/** Common extension ↔ MIME type pairs, "ext type" per entry. "—" = no file extension. */
const MIME: readonly [string, string][] = `
.html text/html|.htm text/html|.css text/css|.js text/javascript|.mjs text/javascript|.json application/json
|.jsonld application/ld+json|.ndjson application/x-ndjson|.xml application/xml|.txt text/plain|.csv text/csv
|.tsv text/tab-separated-values|.md text/markdown|.yaml application/yaml|.yml application/yaml|.toml application/toml
|.ics text/calendar|.vcf text/vcard|.rtf application/rtf|.pdf application/pdf|.doc application/msword
|.docx application/vnd.openxmlformats-officedocument.wordprocessingml.document|.xls application/vnd.ms-excel
|.xlsx application/vnd.openxmlformats-officedocument.spreadsheetml.sheet|.ppt application/vnd.ms-powerpoint
|.pptx application/vnd.openxmlformats-officedocument.presentationml.presentation
|.odt application/vnd.oasis.opendocument.text|.ods application/vnd.oasis.opendocument.spreadsheet
|.odp application/vnd.oasis.opendocument.presentation|.epub application/epub+zip|.zip application/zip
|.gz application/gzip|.tar application/x-tar|.bz2 application/x-bzip2|.xz application/x-xz
|.7z application/x-7z-compressed|.rar application/vnd.rar|.zst application/zstd|.jar application/java-archive
|.wasm application/wasm|.bin application/octet-stream|.exe application/vnd.microsoft.portable-executable
|.apk application/vnd.android.package-archive|.sh application/x-sh|.php application/x-httpd-php|.sql application/sql
|.webmanifest application/manifest+json|.rss application/rss+xml|.atom application/atom+xml
|.xhtml application/xhtml+xml|.svg image/svg+xml|.png image/png|.apng image/apng|.jpg image/jpeg|.jpeg image/jpeg
|.gif image/gif|.webp image/webp|.avif image/avif|.heic image/heic|.jxl image/jxl|.bmp image/bmp
|.ico image/vnd.microsoft.icon|.tif image/tiff|.tiff image/tiff|.mp3 audio/mpeg|.wav audio/wav|.ogg audio/ogg
|.oga audio/ogg|.opus audio/opus|.flac audio/flac|.aac audio/aac|.m4a audio/mp4|.weba audio/webm|.mid audio/midi
|.mp4 video/mp4|.webm video/webm|.ogv video/ogg|.mov video/quicktime|.avi video/x-msvideo|.mkv video/x-matroska
|.mpeg video/mpeg|.ts video/mp2t|.3gp video/3gpp|.woff font/woff|.woff2 font/woff2|.ttf font/ttf|.otf font/otf
|.eot application/vnd.ms-fontobject|.pem application/x-pem-file|.crt application/x-x509-ca-cert
|.p12 application/x-pkcs12|.eml message/rfc822|— multipart/form-data|— application/x-www-form-urlencoded`
  .split('|')
  .map((e) => e.trim().split(' ') as [string, string]);

const EXTENSIONS = new Set(MIME.filter(([ext]) => ext.startsWith('.')).map(([ext]) => ext.slice(1)));

/** Lowercase for both tr-TR and en-US so "IM", "ım" and "im" all find each other. */
const folds = (s: string) => [s.toLocaleLowerCase('tr-TR'), s.toLocaleLowerCase('en-US')];
const matches = (query: string, ...hay: string[]) => {
  const q = folds(query);
  return hay.some((h) => folds(h).some((f, i) => f.includes(q[i]!)));
};

export default defineTool<Opts>({
  id: 'http-ref',
  category: 'web',
  name: { en: 'HTTP status & MIME', tr: 'HTTP durum ve MIME' },
  description: { en: 'Look up HTTP status codes and MIME types', tr: 'HTTP durum kodlarını ve MIME türlerini ara' },
  keywords: ['http', 'status', 'code', 'mime', 'content-type', 'media type', 'durum', 'kod', 'tür'],
  layout: 'table',
  detect: (input) => {
    const s = input.trim();
    return /^[1-5]\d\d$/.test(s) ? 0.3 : 0;
  },
  options: [{ key: 'table', type: 'segmented', values: ['status', 'mime'], default: 'status', hotkey: 't' }],
  run(input, opts, ctx) {
    const q = input.trim();
    const bare = q.toLocaleLowerCase('en-US').replace(/^\./, '');
    // a code prefix or an obvious extension / MIME type picks the table by itself
    const isCode = /^\d{1,3}$/.test(q);
    const isMime = !isCode && (q.startsWith('.') || q.includes('/') || EXTENSIONS.has(bare));
    const table = isCode ? 'status' : isMime ? 'mime' : opts.table;

    if (table === 'status') {
      const rows = STATUS.map(([code, phrase]) => [String(code), phrase, ctx.t(`tool.http-ref.status.${code}`)]).filter(
        ([code, phrase, desc]) => !q || (isCode ? code!.startsWith(q) : matches(q, code!, phrase!, desc!)),
      );
      const columns = [ctx.t('tool.http-ref.col.code'), ctx.t('tool.http-ref.col.phrase'), ctx.t('tool.http-ref.col.description')];
      return { output: { columns, rows }, meta: { table, count: rows.length } };
    }

    const rows = MIME.filter(([ext, type]) => !q || matches(q, ext, type)).map(([ext, type]) => [ext, type]);
    const columns = [ctx.t('tool.http-ref.col.extension'), ctx.t('tool.http-ref.col.type')];
    return { output: { columns, rows }, meta: { table, count: rows.length } };
  },
  examples: [
    { input: '418', output: 'Code  Phrase        Description\n────  ────────────  ────────────────────────────────────────────────────────\n418   I\'m a teapot  The server refuses to brew coffee because it is a teapot' },
    { input: '.webp', output: 'Extension  MIME type\n─────────  ──────────\n.webp      image/webp' },
    { input: 'woff', output: 'Extension  MIME type\n─────────  ──────────\n.woff      font/woff\n.woff2     font/woff2' },
  ],
});
