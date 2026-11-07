import { defineTool, fail } from '@kotilo/kit-core';

type Lang = 'json' | 'js' | 'sql' | 'regex' | 'shell';
type Opts = { mode: 'escape' | 'unescape'; lang: Lang };

const hex = (n: number, w: number) => n.toString(16).padStart(w, '0');

/** Remove one pair of matching surrounding quotes, if present. */
function unquote(s: string, quotes: string): string {
  if (s.length >= 2 && quotes.includes(s[0]!) && s[s.length - 1] === s[0]) return s.slice(1, -1);
  return s;
}

// ---------- JSON ----------
function escapeJson(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

const JSON_SIMPLE: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

function unescapeJson(input: string): string {
  const s = unquote(input, '"');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = s[i + 1];
    if (e === undefined) fail('error.escape.trailingBackslash');
    if (e in JSON_SIMPLE) {
      out += JSON_SIMPLE[e];
      i++;
    } else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
      out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16));
      i += 5;
    } else fail('error.escape.invalidEscape', { seq: `\\${e}`, pos: i + 1 });
  }
  return out;
}

// ---------- JS (single-quoted literal) ----------
const JS_ESC: Record<string, string> = {
  '\\': '\\\\', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f', '\v': '\\v',
  '\u2028': '\\u2028', '\u2029': '\\u2029',
};

function escapeJs(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\\'\n\r\t\b\f\v\u2028\u2029]|[\u0000-\u001F\u007F]/g, (c) => JS_ESC[c] ?? `\\x${hex(c.charCodeAt(0), 2)}`);
}

const JS_SIMPLE: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };

function unescapeJs(input: string): string {
  const s = unquote(input, `'"\``);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = s[i + 1];
    if (e === undefined) fail('error.escape.trailingBackslash');
    const bad = (len: number) => fail('error.escape.invalidEscape', { seq: s.slice(i, i + len), pos: i + 1 });
    if (e in JS_SIMPLE && !(e === '0' && /[0-9]/.test(s[i + 2] ?? ''))) {
      out += JS_SIMPLE[e];
      i++;
    } else if (e === 'x') {
      const h = s.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) bad(4);
      out += String.fromCharCode(parseInt(h, 16));
      i += 3;
    } else if (e === 'u' && s[i + 2] === '{') {
      const end = s.indexOf('}', i + 3);
      const h = end > 0 ? s.slice(i + 3, end) : '';
      const cp = /^[0-9a-fA-F]{1,6}$/.test(h) ? parseInt(h, 16) : NaN;
      if (!(cp <= 0x10ffff)) bad(end > 0 ? end - i + 1 : 3);
      out += String.fromCodePoint(cp);
      i = end;
    } else if (e === 'u') {
      const h = s.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(h)) bad(6);
      out += String.fromCharCode(parseInt(h, 16));
      i += 5;
    } else if (/[1-9]/.test(e)) {
      bad(2); // legacy octal escapes are not allowed in strict mode
    } else if (e === '\r' || e === '\n' || e === '\u2028' || e === '\u2029') {
      i += e === '\r' && s[i + 2] === '\n' ? 2 : 1; // line continuation
    } else {
      out += e; // identity escape: \' \" \\ \`
      i++;
    }
  }
  return out;
}

// ---------- SQL ----------
const escapeSql = (s: string) => s.replace(/'/g, "''");

function unescapeSql(input: string): string {
  const s = unquote(input, "'");
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "'") continue;
    if (s[i + 1] !== "'") fail('error.escape.sqlQuote', { pos: i + 1 });
    i++;
  }
  return s.replace(/''/g, "'");
}

// ---------- regex ----------
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function unescapeRegex(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = s[i + 1];
    if (e === undefined) fail('error.escape.trailingBackslash');
    // only metacharacter escapes are undone; \d, \n, \b… are regex syntax and stay
    out += /[.*+?^${}()|[\]\\/-]/.test(e) ? e : c + e;
    i++;
  }
  return out;
}

// ---------- POSIX shell ----------
const escapeShell = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function unescapeShell(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      if (end < 0) fail('error.escape.unterminated', { quote: "'", pos: i + 1 });
      out += s.slice(i + 1, end);
      i = end + 1;
    } else if (c === '"') {
      let j = i + 1;
      for (; j < s.length && s[j] !== '"'; j++) {
        if (s[j] === '\\' && j + 1 < s.length && '$`"\\\n'.includes(s[j + 1]!)) {
          if (s[j + 1] !== '\n') out += s[j + 1];
          j++;
        } else out += s[j];
      }
      if (j >= s.length) fail('error.escape.unterminated', { quote: '"', pos: i + 1 });
      i = j + 1;
    } else if (c === '\\') {
      if (i + 1 >= s.length) fail('error.escape.trailingBackslash');
      if (s[i + 1] !== '\n') out += s[i + 1];
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const IMPL: Record<Lang, [(s: string) => string, (s: string) => string]> = {
  json: [escapeJson, unescapeJson],
  js: [escapeJs, unescapeJs],
  sql: [escapeSql, unescapeSql],
  regex: [escapeRegex, unescapeRegex],
  shell: [escapeShell, unescapeShell],
};

export default defineTool<Opts>({
  id: 'escape',
  category: 'text',
  name: { en: 'Escape / unescape', tr: 'Escape / unescape' },
  description: {
    en: 'Escape strings for JSON, JS, SQL, regex or shell',
    tr: 'Metni JSON, JS, SQL, regex veya shell için kaçışla',
  },
  keywords: ['escape', 'unescape', 'string', 'quote', 'json', 'sql', 'regex', 'shell', 'kaçış', 'tırnak'],
  options: [
    { key: 'mode', type: 'segmented', values: ['escape', 'unescape'], default: 'escape', hotkey: 'm' },
    { key: 'lang', type: 'select', values: ['json', 'js', 'sql', 'regex', 'shell'], default: 'json', hotkey: 'l' },
  ],
  run(input, opts) {
    const [esc, unesc] = IMPL[opts.lang];
    return { output: opts.mode === 'escape' ? esc(input) : unesc(input) };
  },
  examples: [
    { input: 'Ayşe "İzmir"\n\tyolda', opts: { lang: 'json' }, output: 'Ayşe \\"İzmir\\"\\n\\tyolda' },
    { input: "O'Reilly'nin şiiri", opts: { lang: 'sql' }, output: "O''Reilly''nin şiiri" },
    { input: 'a.b*(c)?', opts: { lang: 'regex' }, output: 'a\\.b\\*\\(c\\)\\?' },
    { input: "it's ılık", opts: { lang: 'shell' }, output: "'it'\\''s ılık'" },
    { input: '"\\u0130stanbul\\n"', opts: { mode: 'unescape', lang: 'json' }, output: 'İstanbul\n' },
  ],
});
