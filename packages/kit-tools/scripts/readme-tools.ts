/**
 * README tool list (docs/01-requirements.md K4): regenerates the block between
 * `<!-- tools:start -->` and `<!-- tools:end -->` from the built-in registry.
 *
 *   pnpm readme:tools          rewrite README.md
 *   pnpm readme:tools --check  exit 1 if README.md is out of date (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { builtinTools } from '../src/index.js';
import en from '../../kit-core/i18n/en.json' with { type: 'json' };

const START = '<!-- tools:start -->';
const END = '<!-- tools:end -->';
const readme = fileURLToPath(new URL('../../../README.md', import.meta.url));
const labels = en as Record<string, string>;

export function toolTable(): string {
  const order: string[] = [];
  const byCategory = new Map<string, typeof builtinTools>();
  for (const tool of builtinTools) {
    if (!byCategory.has(tool.category)) {
      order.push(tool.category);
      byCategory.set(tool.category, []);
    }
    byCategory.get(tool.category)!.push(tool);
  }
  const rows = order.map((category) => {
    const tools = byCategory.get(category)!.map((t) => `\`${t.id}\` ${t.name.en}`).join(' · ');
    return `| ${labels[`category.${category}`] ?? category} | ${tools} |`;
  });
  return [
    `${builtinTools.length} built-in tools, generated from the registry by \`pnpm readme:tools\`.`,
    '',
    '| Category | Tools |',
    '|---|---|',
    ...rows,
  ].join('\n');
}

export function updateReadme(source: string): string {
  const a = source.indexOf(START);
  const b = source.indexOf(END);
  if (a < 0 || b < a) throw new Error(`README.md: missing ${START} … ${END} markers`);
  return `${source.slice(0, a + START.length)}\n${toolTable()}\n${source.slice(b)}`;
}

const current = readFileSync(readme, 'utf8');
const next = updateReadme(current);
if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('README.md tool list is out of date — run `pnpm readme:tools`.');
    process.exit(1);
  }
  console.log('README.md tool list is up to date.');
} else {
  writeFileSync(readme, next);
  console.log(`README.md: ${builtinTools.length} tools.`);
}
