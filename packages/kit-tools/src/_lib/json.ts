/**
 * JSON helpers with engine-independent error positions.
 * JSON.parse messages differ between V8 / JavaScriptCore / WebView2, so on failure we
 * re-scan with a small validator to report a stable line/column.
 */

export interface JsonErrorInfo {
  line: number;
  column: number;
  /** i18n reason key suffix: `unexpectedToken` | `unexpectedEnd` | `trailingComma` | `badString` | `badNumber` */
  reason: string;
  found: string;
}

export class JsonSyntaxError extends Error {
  constructor(readonly info: JsonErrorInfo) {
    super(`${info.reason} at ${info.line}:${info.column}`);
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new JsonSyntaxError(locateJsonError(text));
  }
}

function lineCol(text: string, pos: number) {
  let line = 1;
  let col = 1;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      col = 1;
    } else col++;
  }
  return { line, column: col };
}

export function locateJsonError(text: string): JsonErrorInfo {
  let i = 0;
  const err = (reason: string, at = i): never => {
    throw Object.assign(new Error(reason), { at, reason });
  };
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const value = (): void => {
    ws();
    if (i >= text.length) err('unexpectedEnd');
    const c = text[i]!;
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') return void i++;
      for (;;) {
        ws();
        if (text[i] === '}') err('trailingComma');
        if (text[i] !== '"') err(i >= text.length ? 'unexpectedEnd' : 'unexpectedToken');
        string();
        ws();
        if (text[i] !== ':') err(i >= text.length ? 'unexpectedEnd' : 'unexpectedToken');
        i++;
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') return void i++;
        err(i >= text.length ? 'unexpectedEnd' : 'unexpectedToken');
      }
    }
    if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') return void i++;
      for (;;) {
        ws();
        if (text[i] === ']') err('trailingComma');
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') return void i++;
        err(i >= text.length ? 'unexpectedEnd' : 'unexpectedToken');
      }
    }
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) {
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) err('badNumber');
      i += m![0].length;
      return;
    }
    for (const lit of ['true', 'false', 'null']) {
      if (text.startsWith(lit, i)) {
        i += lit.length;
        return;
      }
    }
    err('unexpectedToken');
  };
  const string = () => {
    const start = i;
    i++;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '"') return void i++;
      if (c === '\\') {
        const n = text[i + 1];
        if (n === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) err('badString');
          i += 6;
        } else if (n !== undefined && '"\\/bfnrt'.includes(n)) i += 2;
        else err('badString');
        continue;
      }
      if (c < ' ') err('badString');
      i++;
    }
    err('unexpectedEnd', start);
  };

  try {
    value();
    ws();
    if (i < text.length) err('unexpectedToken');
    // Validator accepted what JSON.parse rejected — should not happen; point at the end.
    return { ...lineCol(text, text.length), reason: 'unexpectedEnd', found: '' };
  } catch (e) {
    const { at, reason } = e as { at: number; reason: string };
    return { ...lineCol(text, at), reason, found: text.slice(at, at + 12).split('\n')[0] ?? '' };
  }
}

/** Recursively sort object keys (arrays keep their order). */
export function sortKeys(value: unknown, collator: Intl.Collator): unknown {
  if (Array.isArray(value)) return value.map((v) => sortKeys(v, collator));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(collator.compare)
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k], collator)]),
    );
  }
  return value;
}

/**
 * Minimal JSONPath: `$`, `.key`, `['key']`, `[n]` (negative ok), `[*]`, `.*`, `..key`, `[a,b]`.
 * Filters and scripts are intentionally not supported (no eval).
 */
export function jsonPath(root: unknown, path: string): unknown[] {
  const p = path.trim();
  if (!p.startsWith('$')) throw new Error('path');
  let nodes: unknown[] = [root];
  let i = 1;
  const children = (n: unknown): unknown[] =>
    Array.isArray(n) ? n : n && typeof n === 'object' ? Object.values(n) : [];
  const descendants = (n: unknown): unknown[] => [n, ...children(n).flatMap(descendants)];
  const pick = (n: unknown, key: string | number): unknown[] => {
    if (Array.isArray(n) && typeof key === 'number') {
      const v = n[key < 0 ? n.length + key : key];
      return v === undefined ? [] : [v];
    }
    if (n && typeof n === 'object' && !Array.isArray(n) && Object.hasOwn(n, String(key))) {
      return [(n as Record<string, unknown>)[String(key)]];
    }
    return [];
  };

  while (i < p.length) {
    let recursive = false;
    if (p.startsWith('..', i)) {
      recursive = true;
      i += 2;
      nodes = nodes.flatMap(descendants);
    } else if (p[i] === '.') i++;

    if (p[i] === '[') {
      const end = p.indexOf(']', i);
      if (end < 0) throw new Error('path');
      const inner = p.slice(i + 1, end).trim();
      i = end + 1;
      if (inner === '*') {
        nodes = nodes.flatMap(children);
        continue;
      }
      const keys = inner.split(',').map((k) => {
        const s = k.trim();
        if (/^-?\d+$/.test(s)) return Number(s);
        const q = /^(['"])(.*)\1$/.exec(s);
        if (!q) throw new Error('path');
        return q[2]!;
      });
      nodes = nodes.flatMap((n) => keys.flatMap((k) => pick(n, k)));
      continue;
    }
    const m = /^(\*|[^.[\]]+)/.exec(p.slice(i));
    if (!m) {
      if (recursive) continue;
      throw new Error('path');
    }
    i += m[0].length;
    nodes = m[0] === '*' ? nodes.flatMap(children) : nodes.flatMap((n) => pick(n, m[0]));
  }
  return nodes;
}
