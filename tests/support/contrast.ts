/**
 * WCAG 2.1 contrast maths, for asserting the theme tokens.
 *
 * Small on purpose: it understands `#rgb`, `#rrggbb` and `rgba(r, g, b, a)` over
 * the surface colour it is measured against, and it implements the one formula
 * the guidelines define (relative luminance → contrast ratio). No dependency,
 * because a design-system check that can drift is not a check.
 */

/** Parses a token colour into 0–255 channels plus alpha (1 when omitted). */
export function parseColor(value: string): { r: number; g: number; b: number; a: number } {
  const text = value.trim();

  const rgba = text.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }

  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1]!;
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((char) => char + char)
            .join('')
        : digits;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }

  throw new Error(`Unsupported colour: ${value}`);
}

/**
 * Flattens a translucent colour over its backdrop.
 *
 * Every `*Soft` token in the dark theme is an rgba tint, and a tint's contrast
 * is meaningless until it is composited onto whatever sits behind it.
 */
export function flatten(foreground: string, backdrop: string): string {
  const top = parseColor(foreground);
  if (top.a >= 1) return foreground;
  const bottom = parseColor(backdrop);
  const mix = (a: number, b: number) => Math.round(a * top.a + b * (1 - top.a));
  return `rgb(${mix(top.r, bottom.r)}, ${mix(top.g, bottom.g)}, ${mix(top.b, bottom.b)})`;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(color: string, backdrop = '#FFFFFF'): number {
  const { r, g, b } = parseColor(flatten(color, backdrop));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours: 1 (identical) to 21 (black on white). */
export function contrast(foreground: string, background: string): number {
  const a = luminance(foreground, background);
  const b = luminance(background, '#FFFFFF');
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded to two decimals — enough to see a margin, stable in messages. */
export function ratio(foreground: string, background: string): number {
  return Math.round(contrast(foreground, background) * 100) / 100;
}
