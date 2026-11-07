import { describe, expect, it } from 'vitest';
import { contrast, themes } from '../src/index.js';

/** docs/02-design.md: text/base ≥ 7, subtext/base ≥ 4.5, overlay/base ≥ 3 — a failing theme breaks the build. */
const MATRIX = [
  ['text', 7],
  ['subtext', 4.5],
  ['overlay', 3],
] as const;

describe('theme contrast (WCAG)', () => {
  it('computes WCAG ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  for (const theme of themes) {
    describe(theme.id, () => {
      for (const [token, min] of MATRIX) {
        it(`${token}/base ≥ ${min}:1`, () => {
          const ratio = contrast(theme.colors[token], theme.colors.base);
          expect(ratio, `${theme.id}: ${token} ${theme.colors[token]} on base ${theme.colors.base}`).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }
});
