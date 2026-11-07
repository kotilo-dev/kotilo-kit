import { defineTool, fail } from '@kotilo/kit-core';
import { TOKENS, themes, type Theme } from '@kotilo/kit-themes';
import { parseColor, rgbToHsl } from './color.js';

type Opts = { as: 'table' | 'css' | 'json' | 'toml'; color: 'hex' | 'rgb' | 'hsl' };

/**
 * Colors of the bundled themes (docs/05-themes.toml — read through kit-themes, never copied here).
 * Input filters themes by id or name ("nord", "rosé"); words that are token names ("blue base") pick rows.
 * Empty input lists every theme and token.
 */
type TokenName = (typeof TOKENS)[number];
const isToken = (w: string): w is TokenName => (TOKENS as readonly string[]).includes(w);

function parseQuery(input: string): { query: string; tokens: TokenName[] } {
  const words = input.trim().toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean);
  const tokens = words.filter(isToken);
  return { query: words.filter((w) => !isToken(w)).join(' '), tokens: tokens.length ? tokens : [...TOKENS] };
}

function pick(query: string): Theme[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return [...themes];
  const slug = q.replace(/\s+/g, '-');
  const name = (t: Theme) => t.name.toLocaleLowerCase('tr-TR');
  const exact = themes.filter((t) => t.id === slug || name(t) === q);
  if (exact.length) return exact;
  return themes.filter((t) => t.id.includes(slug) || name(t).includes(q));
}

function formatColor(hex: string, as: Opts['color']): string {
  if (as === 'hex') return hex;
  const c = parseColor(hex)!;
  if (as === 'rgb') return `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)})`;
  const { h, s, l } = rgbToHsl(c);
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

export default defineTool<Opts>({
  id: 'theme-palette',
  category: 'visual',
  name: { en: 'Theme palette', tr: 'Tema paleti' },
  description: { en: 'Copy the color codes of the 7 dev themes', tr: '7 dev temasının renk kodlarını kopyala' },
  keywords: ['catppuccin', 'gruvbox', 'nord', 'dracula', 'tokyo', 'everforest', 'rose pine', 'renk', 'tema', 'palette'],
  options: [
    { key: 'as', type: 'segmented', values: ['table', 'css', 'json', 'toml'], default: 'table', hotkey: 'a' },
    { key: 'color', type: 'segmented', values: ['hex', 'rgb', 'hsl'], default: 'hex', hotkey: 'c' },
  ],
  layout: 'table',
  run(input, opts, ctx) {
    const { query, tokens } = parseQuery(input);
    const list = pick(query);
    if (!list.length) fail('error.theme-palette.notFound', { query });
    const value = (t: Theme, token: TokenName) => formatColor(t.colors[token], opts.color);
    const meta = { themes: list.length };

    if (opts.as === 'table') {
      return {
        output: {
          columns: [ctx.t('tool.theme-palette.token'), ...list.map((t) => t.name)],
          rows: tokens.map((token) => [token, ...list.map((t) => value(t, token))]),
        },
        meta,
      };
    }
    if (opts.as === 'css') {
      const blocks = list.map(
        (t) =>
          `/* ${t.name} */\n[data-theme="${t.id}"] {\n  color-scheme: ${t.variant};\n${tokens.map((k) => `  --kit-${k}: ${value(t, k)};`).join('\n')}\n}`,
      );
      return { output: blocks.join('\n\n'), meta };
    }
    if (opts.as === 'json') {
      const obj = Object.fromEntries(
        list.map((t) => [t.id, { name: t.name, variant: t.variant, ...Object.fromEntries(tokens.map((k) => [k, value(t, k)])) }]),
      );
      return { output: JSON.stringify(obj, null, 2), meta };
    }
    const blocks = list.map((t) =>
      [
        `[themes.${t.id}]`,
        `name = ${JSON.stringify(t.name)}`,
        `variant = "${t.variant}"`,
        ...(t.pair ? [`pair = "${t.pair}"`] : []),
        ...tokens.map((k) => `${k} = "${value(t, k)}"`),
      ].join('\n'),
    );
    return { output: blocks.join('\n\n'), meta };
  },
  // rgb/hsl on purpose: hex lives only in docs/05-themes.toml
  examples: [
    {
      input: 'nord blue',
      opts: { as: 'css', color: 'rgb' },
      output: '/* Nord */\n[data-theme="nord"] {\n  color-scheme: dark;\n  --kit-blue: rgb(129 161 193);\n}',
    },
    {
      input: 'dracula base text',
      opts: { as: 'json', color: 'hsl' },
      output: '{\n  "dracula": {\n    "name": "Dracula",\n    "variant": "dark",\n    "base": "hsl(231 15% 18%)",\n    "text": "hsl(60 30% 96%)"\n  }\n}',
    },
    {
      input: 'nord mauve',
      opts: { as: 'toml', color: 'rgb' },
      output: '[themes.nord]\nname = "Nord"\nvariant = "dark"\nmauve = "rgb(180 142 173)"',
    },
  ],
});
