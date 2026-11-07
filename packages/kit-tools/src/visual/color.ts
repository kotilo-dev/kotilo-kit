import { defineTool, fail } from '@kotilo/kit-core';

type Opts = { against: string };

/** sRGB in 0..1 + alpha 0..1 */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_RE = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FN_RE = /^(rgba?|hsla?|oklch)\(\s*([^)]*)\)$/i;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function num(token: string, scale: number): number {
  const t = token.trim();
  if (t.endsWith('%')) return (parseFloat(t) / 100) * scale;
  return parseFloat(t);
}

function hue(token: string): number {
  const t = token.trim().toLowerCase();
  const v = parseFloat(t);
  if (t.endsWith('turn')) return v * 360;
  if (t.endsWith('rad')) return (v * 180) / Math.PI;
  return v;
}

export function parseColor(input: string): Rgba | null {
  const s = input.trim();
  const hex = HEX_RE.exec(s);
  if (hex) {
    let h = hex[1]!;
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  const fn = FN_RE.exec(s);
  if (!fn) return null;
  const kind = fn[1]!.toLowerCase();
  const [main = '', alphaPart] = fn[2]!.split('/');
  const parts = main.split(/[\s,]+/).filter(Boolean);
  // alpha: modern `rgb(1 2 3 / .5)` or legacy `rgba(1, 2, 3, .5)`
  const alphaTok = alphaPart ?? parts[3];
  const a = alphaTok === undefined ? 1 : clamp01(num(alphaTok, 1));
  if (parts.length < 3 || parts.slice(0, 3).some((p) => Number.isNaN(parseFloat(p)))) return null;
  if (kind.startsWith('rgb')) {
    return { r: clamp01(num(parts[0]!, 255) / 255), g: clamp01(num(parts[1]!, 255) / 255), b: clamp01(num(parts[2]!, 255) / 255), a };
  }
  if (kind.startsWith('hsl')) {
    return { ...hslToRgb(hue(parts[0]!), clamp01(num(parts[1]!, 100) / 100), clamp01(num(parts[2]!, 100) / 100)), a };
  }
  // oklch(L C H): L as 0..1 or %, C absolute (100% = 0.4)
  const L = parts[0]!.endsWith('%') ? parseFloat(parts[0]!) / 100 : parseFloat(parts[0]!);
  const C = parts[1]!.endsWith('%') ? (parseFloat(parts[1]!) / 100) * 0.4 : parseFloat(parts[1]!);
  return { ...oklchToRgb(L, C, hue(parts[2]!)), a };
}

export function hslToRgb(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4) };
}

export function rgbToHsl({ r, g, b }: Rgba) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch({ r, g, b }: Rgba) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H: C < 1e-4 ? 0 : H };
}

export function oklchToRgb(L: number, C: number, H: number) {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: clamp01(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp01(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

export function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const r2 = (n: number, d = 2) => Number(n.toFixed(d)).toString();
const byte = (c: number) => Math.round(c * 255);

export function toHexString(c: Rgba): string {
  const h = [c.r, c.g, c.b].map((x) => byte(x).toString(16).padStart(2, '0')).join('');
  return `#${h}${c.a < 1 ? byte(c.a).toString(16).padStart(2, '0') : ''}`;
}

export default defineTool<Opts>({
  id: 'color',
  category: 'visual',
  name: { en: 'Color converter', tr: 'Renk dönüştürücü' },
  description: { en: 'HEX, RGB, HSL, OKLCH and WCAG contrast', tr: 'HEX, RGB, HSL, OKLCH ve WCAG kontrastı' },
  keywords: ['color', 'colour', 'hex', 'rgb', 'hsl', 'oklch', 'contrast', 'wcag', 'renk', 'kontrast'],
  layout: 'table',
  detect(input) {
    const s = input.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return 0.75;
    return FN_RE.test(s) && parseColor(s) ? 0.9 : 0;
  },
  options: [{ key: 'against', type: 'text', default: '', hotkey: 'c' }],
  run(input, opts, ctx) {
    const c = parseColor(input);
    if (!c) fail('error.color.invalid', { input: input.trim().slice(0, 40) });
    const hsl = rgbToHsl(c);
    const lch = rgbToOklch(c);
    const alpha = c.a < 1 ? ` / ${r2(c.a)}` : '';
    const rows: string[][] = [
      ['HEX', toHexString(c)],
      ['RGB', `rgb(${byte(c.r)} ${byte(c.g)} ${byte(c.b)}${alpha})`],
      ['HSL', `hsl(${r2(hsl.h, 1)} ${r2(hsl.s * 100, 1)}% ${r2(hsl.l * 100, 1)}%${alpha})`],
      ['OKLCH', `oklch(${r2(lch.L * 100, 2)}% ${r2(lch.C, 4)} ${r2(lch.H, 2)}${alpha})`],
    ];

    let others: [string, Rgba][] = [
      ['#ffffff', { r: 1, g: 1, b: 1, a: 1 }],
      ['#000000', { r: 0, g: 0, b: 0, a: 1 }],
    ];
    if (opts.against.trim()) {
      const other = parseColor(opts.against);
      if (!other) fail('error.color.invalid', { input: opts.against.trim().slice(0, 40) });
      others = [[toHexString(other), other]];
    }
    for (const [label, other] of others) {
      const ratio = contrastRatio(c, other);
      const grade = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? ctx.t('tool.color.aaLarge') : '✗';
      rows.push([ctx.t('tool.color.contrast', { other: label }), `${r2(ratio)}:1  ${grade}`]);
    }
    return { output: { columns: [ctx.t('tool.color.format'), ctx.t('tool.color.value')], rows }, meta: { hex: toHexString(c) } };
  },
  examples: [],
});
