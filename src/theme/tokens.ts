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
 *   and the neutrals belong to the same family as the accent.
 * - Dark-mode `accentContrast` flips to a near-black teal: selected chips and
 *   the FAB render dark-on-bright, which keeps >7:1 contrast where white on a
 *   bright teal accent would have failed.
 * - Priority is five *distinct* hues. High (orange) and urgent (red) must stay
 *   distinguishable at a glance, so the semantic ramp is intentionally kept
 *   independent of the brand colour.
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
  orange400: '#FB923C',
  orange500: '#F97316',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  emerald400: '#34D399',
  emerald500: '#10B981',
  tealAccent: '#2DD4BF',
  sky400: '#38BDF8',
  sky500: '#0EA5E9',
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
  background: '#F4F8F7',
  backgroundAlt: '#EAF2F0',
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceSunken: '#EDF3F2',
  border: '#E2ECEA',
  borderStrong: '#C7D7D4',
  textPrimary: '#111827',
  textSecondary: '#4B5566',
  // Tertiary sits on white and near-white surfaces, so it has to clear 4.5:1
  // there too: #8A93A6 measured ~2.9:1 and failed WCAG AA.
  textTertiary: '#5F6A7D',
  textInverse: palette.white,
  // Teal-700: passes AA as small text on white *and* under white text.
  accent: palette.teal700,
  accentSecondary: palette.teal500,
  accentGradient: [palette.teal700, palette.teal500],
  accentSoft: palette.teal100,
  accentContrast: palette.white,
  overlay: 'rgba(15, 23, 42, 0.45)',
  danger: palette.rose500,
  dangerSoft: '#FFE4E9',
  success: palette.emerald500,
  successSoft: '#DCFCE7',
  warning: palette.amber500,
  warningSoft: '#FEF3C7',
  priority: {
    none: '#A6AFC0',
    low: palette.sky500,
    medium: palette.amber500,
    high: palette.orange500,
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
  textTertiary: '#71817F',
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
  display: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const, letterSpacing: -0.1 },
  label: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12.5, fontWeight: '500' as const },
  micro: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8 },
} as const;

export type TypographyToken = keyof typeof typography;
