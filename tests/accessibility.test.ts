/**
 * Theme contrast suite.
 *
 * Colours are the one part of an accessibility pass that can be *proved*: no
 * device, no screen reader, no judgement — just the WCAG 2.1 formula over the
 * token pairs the app actually renders. Every failure this suite found was a
 * real one (a caption nobody could read on a sunken card in dark mode, status
 * icons that were tint-on-tint in light mode), and each fix is recorded in
 * `src/theme/tokens.ts`.
 *
 * Thresholds, straight from the guidelines:
 *   - 4.5:1 for text (AA, normal size)
 *   - 3:1 for graphical objects — priority stripes, status icons, focus rings
 *
 * Anything faded on purpose (disabled states, decorative gradient stops) is not
 * asserted here; those are alpha blends of the tokens below, not tokens.
 */
import { describe, expect, it } from 'vitest';

import { darkColors, lightColors, type ThemeColors } from '@/theme/tokens';

import { flatten, ratio } from './support/contrast';

const SURFACES = [
  'background',
  'backgroundAlt',
  'surface',
  'surfaceElevated',
  'surfaceSunken',
] as const;

const THEMES: [string, ThemeColors][] = [
  ['light', lightColors],
  ['dark', darkColors],
];

/** Flattens a translucent tint onto the surface it is drawn over. */
function tint(color: string, surface: string): string {
  return flatten(color, surface);
}

describe.each(THEMES)('%s theme contrast', (_name, colors) => {
  it('keeps body and caption text readable on every surface', () => {
    for (const surface of SURFACES) {
      for (const token of ['textPrimary', 'textSecondary', 'textTertiary'] as const) {
        const value = ratio(colors[token], colors[surface]);
        expect(
          value,
          `${token} on ${surface} is ${value}:1 (needs 4.5)`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the accent and the text on top of it readable', () => {
    for (const surface of SURFACES) {
      const value = ratio(colors.accent, colors[surface]);
      expect(value, `accent on ${surface} is ${value}:1 (needs 4.5)`).toBeGreaterThanOrEqual(4.5);
    }
    const onAccent = ratio(colors.accentContrast, colors.accent);
    expect(onAccent, `accentContrast on accent is ${onAccent}:1`).toBeGreaterThanOrEqual(4.5);
    for (const stop of colors.accentGradient) {
      const value = ratio(colors.accentContrast, stop);
      expect(value, `accentContrast on gradient stop ${stop} is ${value}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('keeps inverted text readable', () => {
    for (const background of ['textPrimary', 'accent'] as const) {
      const value = ratio(colors.textInverse, colors[background]);
      expect(value, `textInverse on ${background} is ${value}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps status text readable on the page', () => {
    for (const token of ['danger', 'success', 'warning'] as const) {
      for (const surface of ['background', 'surface'] as const) {
        const value = ratio(colors[token], colors[surface]);
        expect(value, `${token} on ${surface} is ${value}:1 (needs 4.5)`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it('keeps status icons visible on their own tinted panels', () => {
    for (const token of ['danger', 'success', 'warning'] as const) {
      const soft = colors[`${token}Soft` as const];
      const panel = tint(soft, colors.surface);
      const value = ratio(colors[token], panel);
      expect(value, `${token} on ${token}Soft is ${value}:1 (needs 3)`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps every priority indicator distinguishable', () => {
    for (const priority of ['none', 'low', 'medium', 'high', 'urgent'] as const) {
      const hue = colors.priority[priority];
      const onSurface = ratio(hue, colors.surface);
      expect(
        onSurface,
        `priority ${priority} on surface is ${onSurface}:1 (needs 3)`,
      ).toBeGreaterThanOrEqual(3);

      const panel = tint(colors.prioritySoft[priority], colors.surface);
      const onTint = ratio(hue, panel);
      expect(onTint, `priority ${priority} on its tint is ${onTint}:1 (needs 3)`).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('keeps the priority ramp distinguishable from the accent', () => {
    // A priority stripe must not read as "brand accent" at a glance.
    for (const priority of ['high', 'urgent'] as const) {
      expect(colors.priority[priority]).not.toBe(colors.accent);
    }
  });
});

describe('theme tokens', () => {
  it('declares the same keys in both themes', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
  });

  it('keeps the priority ramp complete in both themes', () => {
    for (const colors of [lightColors, darkColors]) {
      for (const priority of ['none', 'low', 'medium', 'high', 'urgent'] as const) {
        expect(colors.priority[priority]).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(colors.prioritySoft[priority]).toMatch(/^(#[0-9A-Fa-f]{3,6}|rgba?\()/);
      }
    }
  });
});
