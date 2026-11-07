import type { TableOutput, ToolResult } from './types.js';

/** Aligned plain-text table (CLI output, clipboard copy of table results). */
export function formatTable(table: TableOutput): string {
  const all = [table.columns, ...table.rows];
  const len = (s: string) => [...s].length;
  const widths = table.columns.map((_, i) => Math.max(...all.map((r) => len(r[i] ?? ''))));
  const line = (r: string[]) =>
    r
      .map((c, i) => (i === r.length - 1 ? c : c + ' '.repeat(widths[i]! - len(c))))
      .join('  ')
      .trimEnd();
  return [line(table.columns), widths.map((w) => '─'.repeat(w)).join('  '), ...table.rows.map(line)].join('\n');
}

/** Text form of any result: the string output, or the table rendered as aligned text. */
export function resultText(result: ToolResult): string {
  return typeof result.output === 'string' ? result.output : formatTable(result.output);
}
