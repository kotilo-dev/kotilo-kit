import { defineTool, fail } from '@kotilo/kit-core';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { parseOrFail } from './json.js';

type Format = 'json' | 'yaml' | 'toml' | 'xml';
type Opts = { from: 'auto' | Format; to: Format };

export function sniffFormat(input: string): Format | null {
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith('{')) return 'json';
  // `[server]` opens both a JSON array and a TOML table — a lone bracketed header line means TOML
  if (s.startsWith('[')) return /^\[[^\],]+\]\s*$/m.test(s.split('\n')[0]!) && /^\s*[\w."-]+\s*=/m.test(s) ? 'toml' : 'json';
  if (s.startsWith('<')) return 'xml';
  // TOML: [table] headers or `key = value` lines; YAML: `key: value`, `- item`, `---`
  if (/^\s*\[[\w."-]+\]\s*$/m.test(s) || /^\s*[\w."-]+\s*=\s*\S/m.test(s)) {
    if (!/^\s*[\w"-]+\s*:\s/m.test(s)) return 'toml';
  }
  if (/^\s*(---|- |[\w"'-]+\s*:(\s|$))/m.test(s)) return 'yaml';
  return null;
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: true });
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@', format: true, indentBy: '  ' });

function parse(input: string, from: Format): unknown {
  try {
    switch (from) {
      case 'json':
        return parseOrFail(input);
      case 'yaml':
        return parseYaml(input);
      case 'toml':
        return parseToml(input);
      case 'xml': {
        const valid = XMLValidator.validate(input);
        if (valid !== true) fail('error.convert.xml', { line: valid.err.line, column: valid.err.col });
        return xmlParser.parse(input);
      }
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'ToolError') throw e;
    const pos = e as { linePos?: [{ line: number; col: number }]; line?: number; column?: number };
    const line = pos.linePos?.[0]?.line ?? pos.line ?? '?';
    const column = pos.linePos?.[0]?.col ?? pos.column ?? '?';
    fail('error.convert.parse', { format: from.toUpperCase(), line, column });
  }
}

function serialize(value: unknown, to: Format): string {
  switch (to) {
    case 'json':
      return JSON.stringify(value, null, 2);
    case 'yaml':
      return stringifyYaml(value).trimEnd();
    case 'toml':
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('error.convert.tomlRoot');
      return stringifyToml(value as Record<string, unknown>).trimEnd();
    case 'xml': {
      // XML needs a single root element
      const root =
        value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1
          ? value
          : { root: value };
      return String(xmlBuilder.build(root)).trimEnd();
    }
  }
}

export default defineTool<Opts>({
  id: 'json-convert',
  category: 'format',
  name: { en: 'JSON ⇄ YAML ⇄ TOML ⇄ XML', tr: 'JSON ⇄ YAML ⇄ TOML ⇄ XML' },
  description: { en: 'Convert between JSON, YAML, TOML and XML', tr: 'JSON, YAML, TOML ve XML arasında dönüştür' },
  keywords: ['yaml', 'toml', 'xml', 'convert', 'dönüştür', 'yml'],
  detect(input) {
    const f = sniffFormat(input);
    return f === 'yaml' || f === 'toml' ? 0.6 : f === 'json' ? 0.5 : f === 'xml' ? 0.4 : 0;
  },
  options: [
    { key: 'from', type: 'segmented', values: ['auto', 'json', 'yaml', 'toml', 'xml'], default: 'auto', hotkey: 'f' },
    { key: 'to', type: 'segmented', values: ['json', 'yaml', 'toml', 'xml'], default: 'yaml', hotkey: 't' },
  ],
  run(input, opts) {
    if (!input.trim()) fail('error.convert.empty');
    const from = opts.from === 'auto' ? sniffFormat(input) : opts.from;
    if (!from) fail('error.convert.unknown');
    const out = serialize(parse(input, from), opts.to);
    const mime = { json: 'application/json', yaml: 'application/yaml', toml: 'application/toml', xml: 'application/xml' }[opts.to];
    return { output: out, mime, meta: { from } };
  },
  examples: [
    { input: '{"name":"kit","tags":["a","b"]}', opts: { to: 'yaml' }, output: 'name: kit\ntags:\n  - a\n  - b' },
    { input: 'name: kit\nport: 8080', opts: { to: 'json' }, output: '{\n  "name": "kit",\n  "port": 8080\n}' },
    { input: '[server]\nhost = "localhost"', opts: { to: 'json' }, output: '{\n  "server": {\n    "host": "localhost"\n  }\n}' },
    // TOML bare keys are ASCII-only, so non-ASCII keys are quoted
    { input: '{"şehir":"İzmir"}', opts: { to: 'toml' }, output: '"şehir" = "İzmir"' },
  ],
});
