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

// identifier: bare, "quoted", `quoted` or [quoted], optionally schema-qualified
const ID = String.raw`(?:[\w$]+|"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\])(?:\.(?:[\w$*]+|"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]))*`;
const re = (src: string) => new RegExp(src, 'i');

/** Statement shapes; prose like "Select the file from the menu" or "Insert into the slot…" must not match. */
const STRUCTURE: Record<string, RegExp> = {
  select: re(String.raw`^select\s+(?!from\b)[\s\S]+?\bfrom\s+${ID}`),
  insert: re(String.raw`^insert\s+into\s+${ID}\s*(?:\(|values\b|select\b|default\s+values\b|;|$)`),
  update: re(String.raw`^update\s+${ID}\s+set\s+${ID}\s*=`),
  delete: re(String.raw`^delete\s+from\s+${ID}\s*(?:where\b|using\b|returning\b|;|$)`),
  with: re(String.raw`^with\s+(?:recursive\s+)?${ID}\s*(?:\([^)]*\)\s*)?as\s*(?:(?:not\s+)?materialized\s*)?\(`),
  create: re(
    String.raw`^create\s+(?:or\s+replace\s+)?(?:temporary\s+|temp\s+|unique\s+)?(?:table|view|index|database|schema|function|procedure|trigger|sequence|type)\s+(?:if\s+not\s+exists\s+)?${ID}\s*(?:\(|as\b|on\b|;|$)`,
  ),
};

// words that read as English prose and never appear bare in a query
const PROSE_RE = /\b(?:the|your|my|our|their|this|these|those|please|click)\b/i;

export function looksLikeSql(input: string): number {
  const s = input.trim().replace(/^(?:--[^\n]*\n\s*)+/, '');
  const m = START_RE.exec(s);
  if (!m) return 0;
  const kw = m[1]!.toLowerCase();
  // ignore string literals and comments when looking for prose
  const bare = s.replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, '');
  if (PROSE_RE.test(bare)) return 0;
  // a sentence ends with . ! or ?; a query ends with ; or nothing
  if (/[.!?]$/.test(bare.trim())) return 0;
  if (STRUCTURE[kw]!.test(s)) return 0.7;
  // "select 1", "select now()": SELECT without FROM, recognised only with expression syntax
  if (kw === 'select' && /^select\s+[^\s]/i.test(s) && /[(),=*'"0-9]/.test(s.slice(6))) return 0.4;
  return 0;
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
