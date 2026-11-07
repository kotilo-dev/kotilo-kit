import { defineTool, fail } from '@kotilo/kit-core';
import { DOMParser, XMLSerializer, type Document as XDocument, type Element as XElement, type Node as XNode } from '@xmldom/xmldom';
import * as xpath from 'xpath';

type Opts = { mode: 'format' | 'minify'; indent: number; xpath: string };

const HTML_ROOT = /^<(?:!doctype\s+html|html|head|body|div|span|p|a|ul|ol|li|table|section|article|nav|header|footer|main|form|script|style|img|br|h[1-6])\b/i;

export function looksLikeXml(input: string): number {
  const s = input.trim();
  if (!s.startsWith('<')) return 0;
  if (/^<\?xml\s/.test(s)) return 0.8;
  if (HTML_ROOT.test(s)) return 0;
  const body = s.replace(/^(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)+/i, '');
  const m = /^<([A-Za-z_][\w.:-]*)[\s>/]/.exec(body);
  if (!m) return 0;
  if (new RegExp(`^<${m[1]!.replace(/\./g, '\\.')}\\b[^>]*/>$`).test(body)) return 0.4;
  return body.endsWith(`</${m[1]}>`) ? 0.6 : 0;
}

interface ParseProblem {
  detail: string;
  line: number;
  column: number;
}

function parse(input: string): XDocument {
  let problem: ParseProblem | undefined;
  const parser = new DOMParser({
    onError(_level, message, context) {
      const loc = (context as { locator?: { lineNumber?: number; columnNumber?: number } } | undefined)?.locator;
      problem ??= { detail: String(message), line: loc?.lineNumber || 1, column: loc?.columnNumber || 1 };
      // well-formedness is strict here: warnings (e.g. unquoted attributes) are errors too
      throw new Error(String(message));
    },
  });
  try {
    return parser.parseFromString(input, 'text/xml');
  } catch (e) {
    const loc = (e as { locator?: { lineNumber?: number; columnNumber?: number } }).locator;
    const p = problem ?? {
      detail: e instanceof Error ? e.message : String(e),
      line: loc?.lineNumber || 1,
      column: loc?.columnNumber || 1,
    };
    fail('error.xml.invalid', { detail: p.detail.replace(/^\[xmldom \w+\]\s*/, ''), line: p.line, column: p.column });
  }
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const isBlank = (n: XNode) => n.nodeType === 3 && !/\S/.test(n.nodeValue ?? '');
const kids = (n: XNode): XNode[] => Array.from({ length: n.childNodes.length }, (_, i) => n.childNodes[i]!);

class Printer {
  private readonly raw = new XMLSerializer();
  constructor(
    private readonly minify: boolean,
    private readonly unit: string,
  ) {}

  private pad(depth: number) {
    return this.minify ? '' : this.unit.repeat(depth);
  }

  node(n: XNode, depth: number): string | null {
    const pad = this.pad(depth);
    switch (n.nodeType) {
      case 1:
        return this.element(n as XElement, depth);
      case 3:
        return isBlank(n) ? null : pad + escText((n.nodeValue ?? '').trim());
      case 4:
        return `${pad}<![CDATA[${n.nodeValue ?? ''}]]>`;
      case 7:
        return `${pad}<?${n.nodeName}${n.nodeValue ? ` ${n.nodeValue}` : ''}?>`;
      case 8:
        return this.minify ? null : `${pad}<!--${n.nodeValue ?? ''}-->`;
      case 10:
        return pad + this.raw.serializeToString(n);
      default:
        return pad + this.raw.serializeToString(n);
    }
  }

  element(el: XElement, depth: number): string {
    const pad = this.pad(depth);
    const attrs = Array.from({ length: el.attributes.length }, (_, i) => el.attributes[i]!)
      .map((a) => ` ${a.name}="${escAttr(a.value)}"`)
      .join('');
    const children = kids(el).filter((c) => !isBlank(c));
    if (!children.length) return `${pad}<${el.tagName}${attrs}/>`;
    const textual = children.every((c) => c.nodeType === 3 || c.nodeType === 4);
    if (textual) {
      const inner = children.map((c) => (c.nodeType === 4 ? `<![CDATA[${c.nodeValue ?? ''}]]>` : escText(c.nodeValue ?? ''))).join('');
      return `${pad}<${el.tagName}${attrs}>${inner}</${el.tagName}>`;
    }
    // mixed content (text next to elements): whitespace is meaningful, keep it as written
    if (children.some((c) => c.nodeType === 3)) return pad + this.raw.serializeToString(el);
    const nl = this.minify ? '' : '\n';
    const body = children.map((c) => this.node(c, depth + 1)).filter((s): s is string => s !== null);
    return `${pad}<${el.tagName}${attrs}>${nl}${body.join(nl)}${nl}${pad}</${el.tagName}>`;
  }

  document(doc: XDocument): string {
    const parts = kids(doc)
      .map((c) => this.node(c, 0))
      .filter((s): s is string => s !== null);
    return parts.join(this.minify ? '' : '\n');
  }
}

function namespaces(doc: XDocument): Record<string, string> {
  const map: Record<string, string> = {};
  const root = doc.documentElement;
  if (!root) return map;
  for (let i = 0; i < root.attributes.length; i++) {
    const a = root.attributes[i]!;
    if (a.name.startsWith('xmlns:')) map[a.name.slice(6)] = a.value;
  }
  return map;
}

export default defineTool<Opts>({
  id: 'xml',
  category: 'format',
  name: { en: 'XML format', tr: 'XML biçimlendir' },
  description: { en: 'Format, minify, validate and query XML with XPath', tr: 'XML biçimlendir, küçült, doğrula ve XPath ile sorgula' },
  keywords: ['xml', 'xpath', 'pretty', 'beautify', 'minify', 'validate', 'güzelleştir', 'doğrula'],
  detect: looksLikeXml,
  options: [
    { key: 'mode', type: 'segmented', values: ['format', 'minify'], default: 'format', hotkey: 'm' },
    { key: 'indent', type: 'number', default: 2, min: 1, max: 8, hotkey: 'i' },
    { key: 'xpath', type: 'text', default: '', hotkey: 'x' },
  ],
  run(input, opts) {
    if (!input.trim()) fail('error.xml.empty');
    const doc = parse(input.trim());
    const printer = new Printer(opts.mode === 'minify', ' '.repeat(Math.max(1, Math.min(8, Math.round(opts.indent) || 2))));
    const expr = opts.xpath.trim();
    if (!expr) return { output: printer.document(doc), mime: 'application/xml', meta: { valid: true } };

    let result: xpath.SelectReturnType;
    try {
      const ns = namespaces(doc);
      const select = Object.keys(ns).length ? xpath.useNamespaces(ns) : xpath.select;
      result = select(expr, doc as unknown as Parameters<typeof xpath.select>[1]);
    } catch {
      fail('error.xml.xpath', { query: expr });
    }
    if (!Array.isArray(result)) {
      return { output: result === null ? '' : String(result), meta: { valid: true, matches: result === null ? 0 : 1 } };
    }
    const lines = (result as unknown as XNode[]).map((n) => {
      if (n.nodeType === 1) return printer.element(n as XElement, 0);
      if (n.nodeType === 9) return printer.document(n as XDocument);
      return n.nodeValue ?? '';
    });
    return { output: lines.join('\n'), meta: { valid: true, matches: lines.length } };
  },
  examples: [
    { input: '<a><b x="1">hi</b><c/></a>', output: '<a>\n  <b x="1">hi</b>\n  <c/>\n</a>' },
    { input: '<a>\n  <!-- note -->\n  <b>1</b>\n</a>', opts: { mode: 'minify' }, output: '<a><b>1</b></a>' },
    {
      input: '<şehirler><şehir ad="İzmir"/><şehir ad="Iğdır"/></şehirler>',
      opts: { xpath: '//şehir/@ad' },
      output: 'İzmir\nIğdır',
    },
  ],
});
