/**
 * Design tokens for TaskFlow.
 *
 * A single source of truth for colour, spacing, radii, motion and type so the
 * light/dark themes stay perfectly in sync and components never hardcode
 * one-off values.
 *
 * Palette strategy
 * ----------------
 * - Brand accent is **teal** (`#0F766E` light / `#2DD4BF` dark). Two accent
 *   stops (`accent` → `accentSecondary`) drive gradients so the app has a
 *   recognisable identity in both themes instead of a flat fill.
 * - Surfaces step up in three tiers (sunken → surface → elevated) with a
 *   subtle teal tint in both themes, so cards read as cards rather than mush
 *   and the neutrals belong to the same family as the accent. Every step is
 *   deliberately *small*: a screen should read as one calm surface with a few
 *   soft panels on it, not as a stack of outlined boxes.
 * - Chrome is rationed. A panel gets either a hairline border or a soft
 *   shadow, never both, and a row of metadata gets plain text with ` · `
 *   separators instead of a pill per attribute. That is the difference between
 *   a screen you scan and one you have to read.
 * - Dark-mode `accentContrast` flips to a near-black teal: selected chips and
 *   the FAB render dark-on-bright, which keeps >7:1 contrast where white on a
 *   bright teal accent would have failed.
 * - Priority is five *distinct* hues. High (orange) and urgent (red) must stay
 *   distinguishable at a glance, so the semantic ramp is intentionally kept
 *   independent of the brand colour.
 *
 * Contrast (WCAG 2.1)
 * -------------------
 * `tests/accessibility.test.ts` asserts the pairs this file declares — text at
 * 4.5:1, indicators at 3:1 — because "it looks fine" is not a measurement. Five
 * pairs failed that check when it was written, and the values below are the
 * fixes; the light theme moved one stop darker rather than the layout getting
 * bolder, so nothing about the design had to be re-drawn:
 *
 * | Pair | Was | Now |
 * | --- | --- | --- |
 * | light `accentContrast` on the gradient's second stop | 2.49:1 | 7.8:1 (stop is teal800) |
 * | light `textTertiary`-equivalent `danger` / `success` / `warning` as text | 3.43 / 2.37 / 2.01 | rose700 / emerald700 / amber700 |
 * | light status icons on their own tinted panels | 1.9–2.3:1 | 4.5:1+ |
 * | light priority stripes and dots | 2.2–2.8:1 | 3.5:1+ |
 * | dark `textTertiary` on `surfaceElevated` / `surfaceSunken` | 4.21 / 3.75 | 5.4 / 4.8 |
 *
 * The dark theme needed one change: a caption on a sunken card was the only
 * place it dipped under AA. Priority hues stayed their own hues in both themes;
 * only their depth moved.
 */

export const palette = {
  // Brand ramp — teal.
  teal50: '#E7F7F5',
  teal100: '#CDEEEA',
  teal200: '#9DE1DA',
  teal400: '#2DD4BF',
  teal500: '#14B8A6',
  teal600: '#0D9488',
  teal700: '#0F766E',
  teal800: '#115E59',
  teal900: '#134E4A',

  rose400: '#FB7185',
  rose500: '#F43F5E',
  rose600: '#E11D48',
  rose700: '#BE123C',
  orange400: '#FB923C',
  orange500: '#F97316',
  orange600: '#EA580C',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  amber700: '#B45309',
  emerald400: '#34D399',
  emerald500: '#10B981',
  emerald700: '#047857',
  tealAccent: '#2DD4BF',
  sky400: '#38BDF8',
  sky500: '#0EA5E9',
  sky600: '#0284C7',
  violet400: '#A78BFA',
  indigo500: '#6C5CE7',
  fuchsia400: '#E879F9',

  slate25: '#FCFCFD',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate150: '#E9EEF6',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',

  // Cool, slightly teal-tinted dark ramp — less "pure black", easier on the
  // eyes, and the neutrals sit in the same colour family as the accent.
  ink0: '#050B0B',
  ink1: '#0C1314',
  ink2: '#141D1E',
  ink3: '#1D2728',
  ink4: '#283435',
  ink5: '#354344',

  white: '#FFFFFF',
  black: '#000000',
} as const;

/**
 * Fixed colours belonging to the mascot itself (the smiling check).
 *
 * These are intentionally outside the light/dark ramps: the launcher icon and
 * the splash cannot follow a theme, so the character keeps one identity
 * everywhere. `scripts/generate-logo.py` mirrors these exact values — change
 * one and re-run the generator.
 */
export const brand = {
  /** Thick soft outline around the tick. */
  outline: '#062A27',
  /** Eyes and smile. */
  face: '#07332F',
  /** Cheeks, drawn at low alpha. */
  blush: '#FB7185',
} as const;

/**
 * Colours offered in the tag / project / habit colour picker.
 * Brand teal leads; index 5 stays amber because recurrence chips address
 * `swatches[5]` directly.
 */
export const swatches = [
  palette.teal600,
  palette.sky500,
  palette.emerald500,
  palette.violet400,
  palette.rose500,
  palette.amber500,
  palette.orange500,
  palette.indigo500,
  palette.fuchsia400,
  palette.slate500,
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

/**
 * One elevation, used everywhere.
 *
 * Cards, sheets and the FAB all used to invent their own shadow radius and
 * opacity, which is why the screen looked busy even when it was empty. Two
 * steps — a resting panel and a floating control — is enough, and `hairline`
 * lets the components that own a border keep it instead of adding a shadow on
 * top of it.
 */
export const elevation = {
  /** Resting content: you should feel it, not see it. */
  card: {
    shadowColor: 'rgba(14, 47, 43, 0.16)',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  /** Anything that floats above the page: sheets, the FAB, the undo strip. */
  floating: {
    shadowColor: 'rgba(14, 47, 43, 0.32)',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  '2xl': 28,
  pill: 999,
} as const;

export const motion = {
  fast: 140,
  base: 220,
  slow: 380,
  /** Spring config used across the app for a consistent tactile feel. */
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
} as const;

export type PriorityKey = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export interface ThemeColors {
  background: string;
  /** Second background stop used behind list content for a soft vignette. */
  backgroundAlt: string;
  surface: string;
  surfaceElevated: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  accent: string;
  accentSecondary: string;
  /** `[from, to]` stops for gradient surfaces — empty states, rings. */
  accentGradient: [string, string];
  accentSoft: string;
  accentContrast: string;
  overlay: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  priority: Record<PriorityKey, string>;
  prioritySoft: Record<PriorityKey, string>;
  shadow: string;
}

export const lightColors: ThemeColors = {
  background: '#F6F9F8',
  backgroundAlt: '#EDF3F2',
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceSunken: '#F0F5F4',
  border: '#E6EDEC',
  borderStrong: '#C9D8D6',
  textPrimary: '#111827',
  textSecondary: '#4B5566',
  // Tertiary sits on white and near-white surfaces, so it has to clear 4.5:1
  // there too: #8A93A6 measured ~2.9:1 and failed WCAG AA.
  textTertiary: '#5F6A7D',
  textInverse: palette.white,
  // Teal-700: passes AA as small text on white *and* under white text.
  accent: palette.teal700,
  accentSecondary: palette.teal500,
  // Both stops carry text and icons where the gradient is a surface (the focus
  // pill, the capture FAB), so the ramp runs teal-700 → teal-800: white on
  // teal-500 measured 2.49:1 and on teal-600 3.74:1, neither of which is
  // readable copy.
  accentGradient: [palette.teal700, palette.teal800],
  accentSoft: palette.teal100,
  accentContrast: palette.white,
  overlay: 'rgba(15, 23, 42, 0.45)',
  // The status colours are read as *text* ("Notifications are on") and as icons
  // on their own soft panels, so the light theme uses the 700 stops: the 500s
  // were pastel enough to sit at 1.9–2.4:1 on their own tint.
  danger: palette.rose700,
  dangerSoft: '#FFE4E9',
  success: palette.emerald700,
  successSoft: '#DCFCE7',
  warning: palette.amber700,
  warningSoft: '#FEF3C7',
  priority: {
    none: palette.slate500,
    low: palette.sky600,
    medium: palette.amber700,
    high: palette.orange600,
    urgent: palette.rose600,
  },
  prioritySoft: {
    none: '#EEF1F6',
    low: '#E0F2FE',
    medium: '#FEF3C7',
    high: '#FFEDD5',
    urgent: '#FFE4E6',
  },
  shadow: 'rgba(14, 47, 43, 0.12)',
};

export const darkColors: ThemeColors = {
  background: palette.ink0,
  backgroundAlt: palette.ink1,
  surface: palette.ink1,
  surfaceElevated: palette.ink2,
  surfaceSunken: palette.ink3,
  border: palette.ink3,
  borderStrong: palette.ink4,
  textPrimary: '#F2F7F6',
  textSecondary: '#A4B4B2',
  // Was #71817F, which cleared AA on the page background but dropped to 3.75:1
  // on a sunken card — exactly where the smallest captions live.
  textTertiary: '#849492',
  textInverse: palette.ink0,
  // Bright teal reads as a link/label on the dark ramp…
  accent: palette.teal400,
  accentSecondary: palette.teal500,
  // …while gradient surfaces stay bright so the flipped dark accentContrast
  // keeps >7:1 contrast wherever it sits on top of them.
  accentGradient: [palette.teal400, palette.teal500],
  accentSoft: 'rgba(45, 212, 191, 0.16)',
  accentContrast: '#04211E',
  overlay: 'rgba(0, 0, 0, 0.66)',
  danger: palette.rose400,
  dangerSoft: 'rgba(251, 113, 133, 0.16)',
  success: palette.emerald400,
  successSoft: 'rgba(52, 211, 153, 0.16)',
  warning: palette.amber400,
  warningSoft: 'rgba(251, 191, 36, 0.16)',
  priority: {
    none: '#8FA09E',
    low: palette.sky400,
    medium: palette.amber400,
    high: palette.orange400,
    urgent: palette.rose400,
  },
  prioritySoft: {
    none: 'rgba(148, 163, 184, 0.16)',
    low: 'rgba(56, 189, 248, 0.16)',
    medium: 'rgba(251, 191, 36, 0.16)',
    high: 'rgba(251, 146, 60, 0.18)',
    urgent: 'rgba(251, 113, 133, 0.18)',
  },
  shadow: 'rgba(0, 0, 0, 0.55)',
};

/**
 * Type scale.
 *
 * `micro` is the all-caps workhorse (DUE TODAY, OVERDUE, BOARD…). It used to be
 * 10 px, which is below the 12 sp floor Android's own guidelines set for
 * supporting text — and it carries real information on this app's headers, so
 * it was raised to 11 px with a little more tracking instead of staying tiny.
 */
export const typography = {
  display: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -1 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 16.5, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.1 },
  label: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12.5, fontWeight: '500' as const },
  // The all-caps workhorse. Tracking is tighter than it was: 0.8px at 11px
  // made short labels read as a headline of their own, which is one of the
  // reasons the old screens felt louder than they were.
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

export type TypographyToken = keyof typeof typography;
