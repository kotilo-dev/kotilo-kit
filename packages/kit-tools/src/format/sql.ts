import { defineTool, fail } from '@kotilo/kit-core';
import { format, type SqlLanguage } from 'sql-formatter';

const DIALECTS = [
  'sql',
  'postgresql',
  'mysql',
  'mariadb',
  'sqlite',
  'transactsql',
  'plsql',
  'bigquery',
  'snowflake',
  'redshift',
  'clickhouse',
  'duckdb',
  'db2',
  'hive',
  'spark',
  'trino',
] as const satisfies readonly SqlLanguage[];

type Opts = {
  dialect: (typeof DIALECTS)[number];
  keywordCase: 'upper' | 'lower' | 'preserve';
  indent: number;
};

const START_RE = /^(?:--[^\n]*\n\s*)*(select|insert|update|delete|with|create)\b/i;

export function looksLikeSql(input: string): number {
  const s = input.trim();
  const m = START_RE.exec(s);
  if (!m) return 0;
  const kw = m[1]!.toLowerCase();
  const structure: Record<string, RegExp> = {
    select: /\bfrom\b|^select\s+[\w'"(*@-]/i,
    insert: /\binsert\s+into\b/i,
    update: /^update\s+\S+\s+set\b/i,
    delete: /\bdelete\s+from\b/i,
    with: /\bas\s*\(/i,
    create: /\bcreate\s+(?:or\s+replace\s+)?(?:temporary\s+|temp\s+|unique\s+)?(?:table|view|index|database|schema|function|procedure|trigger|sequence|type)\b/i,
  };
  if (!structure[kw]!.test(s)) return 0;
  // "select a few items" style prose: SELECT without FROM and with many plain words
  if (kw === 'select' && !/\bfrom\b/i.test(s) && !/[(),=*'"0-9]/.test(s)) return 0;
  return /\bfrom\b|\binto\b|\bset\b|\btable\b|\bas\s*\(/i.test(s) ? 0.7 : 0.4;
}

export default defineTool<Opts>({
  id: 'sql',
  category: 'format',
  name: { en: 'SQL format', tr: 'SQL biçimlendir' },
  description: { en: 'Format SQL queries for many dialects', tr: 'SQL sorgularını birçok lehçe için biçimlendir' },
  keywords: ['sql', 'query', 'pretty', 'beautify', 'postgres', 'mysql', 'sqlite', 'sorgu', 'güzelleştir'],
  detect: looksLikeSql,
  options: [
    { key: 'dialect', type: 'select', values: DIALECTS, default: 'sql', hotkey: 'd' },
    { key: 'keywordCase', type: 'select', values: ['upper', 'lower', 'preserve'], default: 'upper', hotkey: 'k' },
    { key: 'indent', type: 'number', default: 2, min: 1, max: 8, hotkey: 'i' },
  ],
  run(input, opts) {
    if (!input.trim()) fail('error.sql.empty');
    let out: string;
    try {
      out = format(input, {
        language: opts.dialect,
        keywordCase: opts.keywordCase,
        tabWidth: Math.max(1, Math.min(8, Math.round(opts.indent) || 2)),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const detail = (msg.split('\n')[0] ?? msg).replace(/^Parse error:?\s*/i, '').trim();
      fail('error.sql.parse', { detail });
    }
    return { output: out, mime: 'application/sql', meta: { lines: out.split('\n').length } };
  },
  examples: [
    { input: 'select a, b from t where x = 1', output: 'SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1' },
    {
      input: 'SELECT id FROM users WHERE city = \'İzmir\'',
      opts: { keywordCase: 'lower', indent: 4 },
      output: "select\n    id\nfrom\n    users\nwhere\n    city = 'İzmir'",
    },
    {
      input: 'insert into t (a, b) values (1, 2)',
      opts: { dialect: 'postgresql' },
      output: 'INSERT INTO\n  t (a, b)\nVALUES\n  (1, 2)',
    },
  ],
});
