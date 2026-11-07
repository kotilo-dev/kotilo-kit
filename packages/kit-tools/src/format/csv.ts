import { defineTool, fail } from '@kotilo/kit-core';
import Papa from 'papaparse';
import { parseOrFail } from './json.js';

type Opts = {
  mode: 'csv-json' | 'json-csv' | 'csv-md';
  delimiter: 'auto' | ',' | ';' | 'tab' | '|';
  header: boolean;
};

const DELIMS = [',', ';', '\t', '|'];

export function looksLikeCsv(input: string): number {
  const lines = input.trim().split(/\r?\n/).filter(Boolean).slice(0, 20);
  if (lines.length < 2) return 0;
  for (const d of DELIMS) {
    const counts = lines.map((l) => l.split(d).length - 1);
    if (counts[0]! >= 1 && counts.every((c) => c === counts[0])) return 0.6;
  }
  return 0;
}

function parseCsv(input: string, opts: Opts) {
  const delimiter = opts.delimiter === 'auto' ? '' : opts.delimiter === 'tab' ? '\t' : opts.delimiter;
  const res = Papa.parse<string[]>(input.trim(), { delimiter, skipEmptyLines: true });
  const err = res.errors.find((e) => e.type !== 'Delimiter');
  if (err) fail('error.csv.parse', { row: (err.row ?? 0) + 1, detail: err.message });
  return { rows: res.data, delimiter: res.meta.delimiter };
}

const mdCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

export default defineTool<Opts>({
  id: 'csv',
  category: 'format',
  name: { en: 'CSV ⇄ JSON ⇄ Markdown', tr: 'CSV ⇄ JSON ⇄ Markdown' },
  description: { en: 'Convert CSV to JSON or a Markdown table, and back', tr: "CSV'yi JSON'a veya Markdown tabloya dönüştür, tersi de" },
  keywords: ['csv', 'tsv', 'table', 'tablo', 'markdown', 'excel'],
  detect: looksLikeCsv,
  options: [
    { key: 'mode', type: 'segmented', values: ['csv-json', 'json-csv', 'csv-md'], default: 'csv-json', hotkey: 'm' },
    { key: 'delimiter', type: 'select', values: ['auto', ',', ';', 'tab', '|'], default: 'auto', hotkey: 'd' },
    { key: 'header', type: 'toggle', default: true, hotkey: 'h' },
  ],
  run(input, opts) {
    if (!input.trim()) fail('error.csv.empty');

    if (opts.mode === 'json-csv') {
      const data = parseOrFail(input);
      if (!Array.isArray(data)) fail('error.csv.jsonArray');
      const delimiter = opts.delimiter === 'auto' ? ',' : opts.delimiter === 'tab' ? '\t' : opts.delimiter;
      const flat = data.map((row) =>
        row && typeof row === 'object' && !Array.isArray(row)
          ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v]))
          : row,
      );
      return { output: Papa.unparse(flat, { delimiter, header: opts.header, newline: '\n' }), mime: 'text/csv' };
    }

    const { rows, delimiter } = parseCsv(input, opts);
    const meta = { rows: rows.length - (opts.header ? 1 : 0), delimiter: delimiter === '\t' ? 'tab' : delimiter };

    if (opts.mode === 'csv-md') {
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array<string>(width - r.length).fill('')];
      const [head, ...body] = opts.header ? rows : [Array.from({ length: width }, (_, i) => `${i + 1}`), ...rows];
      const line = (r: string[]) => `| ${pad(r).map(mdCell).join(' | ')} |`;
      const out = [line(head!), `|${' --- |'.repeat(width)}`, ...body.map(line)].join('\n');
      return { output: out, mime: 'text/markdown', meta };
    }

    let out: unknown;
    if (opts.header) {
      const [head = [], ...body] = rows;
      out = body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
    } else out = rows;
    return { output: JSON.stringify(out, null, 2), mime: 'application/json', meta };
  },
  examples: [
    { input: 'ad,şehir\nAyşe,İzmir\nIşıl,Iğdır', output: '[\n  {\n    "ad": "Ayşe",\n    "şehir": "İzmir"\n  },\n  {\n    "ad": "Işıl",\n    "şehir": "Iğdır"\n  }\n]' },
    { input: 'a;b\n1;2', opts: { mode: 'csv-md' }, output: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
    { input: '[{"a":1,"b":"x,y"}]', opts: { mode: 'json-csv' }, output: 'a,b\n1,"x,y"' },
  ],
});
