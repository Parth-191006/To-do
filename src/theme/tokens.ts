/**
 * Design tokens for TaskFlow.
 *
 * A single source of truth for colour, spacing, radii, motion and type so the
 * light/dark themes stay perfectly in sync and components never hardcode
 * one-off values.
 *
 * Palette strategy
 * ----------------
 * - Two accent stops (`accent` → `accentSecondary`) drive gradients so the app
 *   has a recognisable identity in both themes instead of a flat fill.
 * - Surfaces step up in three tiers (sunken → surface → elevated) with a subtle
 *   violet tint in dark mode, so cards read as cards rather than as mush.
 * - Priority is five *distinct* hues. High (orange) and urgent (red) used to be
 *   the same colour, which made the two most important tiers impossible to tell
 *   apart at a glance.
 */

export const palette = {
  indigo50: '#EEF0FF',
  indigo100: '#E0E2FF',
  indigo200: '#C7C9FF',
  indigo400: '#8B7CF6',
  indigo500: '#6C5CE7',
  indigo600: '#5A48D6',
  indigo700: '#4536A8',

  rose400: '#FB7185',
  rose500: '#F43F5E',
  rose600: '#E11D48',
  orange400: '#FB923C',
  orange500: '#F97316',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  emerald400: '#34D399',
  emerald500: '#10B981',
  teal400: '#2DD4BF',
  sky400: '#38BDF8',
  sky500: '#0EA5E9',
  violet400: '#A78BFA',
  violet600: '#9333EA',
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

  // Cool, slightly violet-tinted dark ramp — less "pure black", easier on the eyes.
  ink0: '#08080F',
  ink1: '#101019',
  ink2: '#181826',
  ink3: '#222234',
  ink4: '#2E2E45',
  ink5: '#3B3B57',

  white: '#FFFFFF',
  black: '#000000',
} as const;

/** Colours offered in the tag / project / habit colour picker. */
export const swatches = [
  palette.indigo500,
  palette.violet400,
  palette.sky500,
  palette.teal400,
  palette.emerald500,
  palette.amber500,
  palette.orange500,
  palette.rose500,
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
  /** `[from, to]` stops for gradient surfaces — hero cards, the FAB, rings. */
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
  background: '#F5F7FC',
  backgroundAlt: '#EDF1FA',
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceSunken: '#EEF1F8',
  border: '#E4E9F2',
  borderStrong: palette.slate300,
  textPrimary: '#111827',
  textSecondary: '#5A6478',
  textTertiary: '#8A93A6',
  textInverse: palette.white,
  accent: palette.indigo500,
  accentSecondary: palette.violet400,
  accentGradient: [palette.indigo500, palette.violet400],
  accentSoft: palette.indigo50,
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
  shadow: 'rgba(24, 33, 61, 0.12)',
};

export const darkColors: ThemeColors = {
  background: palette.ink0,
  backgroundAlt: palette.ink1,
  surface: palette.ink1,
  surfaceElevated: palette.ink2,
  surfaceSunken: palette.ink3,
  border: palette.ink3,
  borderStrong: palette.ink4,
  textPrimary: '#F6F7FC',
  textSecondary: '#A4ADC0',
  textTertiary: '#727C93',
  textInverse: palette.ink0,
  accent: palette.indigo400,
  // Gradient stops stay deep enough that white text/images on them keep ~4.5:1
  // contrast; the brighter violet is reserved for the accent tint itself.
  accentSecondary: palette.violet600,
  accentGradient: [palette.indigo500, palette.violet600],
  accentSoft: 'rgba(139, 124, 246, 0.18)',
  accentContrast: palette.white,
  overlay: 'rgba(0, 0, 0, 0.66)',
  danger: palette.rose400,
  dangerSoft: 'rgba(251, 113, 133, 0.16)',
  success: palette.emerald400,
  successSoft: 'rgba(52, 211, 153, 0.16)',
  warning: palette.amber400,
  warningSoft: 'rgba(251, 191, 36, 0.16)',
  priority: {
    none: palette.slate500,
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

export const typography = {
  display: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.8 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const, letterSpacing: -0.1 },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  micro: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.6 },
} as const;

export type TypographyToken = keyof typeof typography;
