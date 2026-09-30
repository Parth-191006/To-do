/**
 * Design tokens for TaskFlow.
 *
 * A single source of truth for colour, spacing, radii, motion and type so the
 * light/dark themes stay perfectly in sync and components never hardcode
 * one-off values. The palette is deliberately restrained: one accent, a small
 * set of semantic priority colours, and generous negative space.
 */

export const palette = {
  indigo50: '#EEF0FF',
  indigo100: '#E0E2FF',
  indigo400: '#8B7CF6',
  indigo500: '#6C5CE7',
  indigo600: '#5A48D6',
  indigo700: '#4536A8',

  rose400: '#FB7185',
  rose500: '#F43F5E',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  emerald400: '#34D399',
  emerald500: '#10B981',
  sky400: '#38BDF8',
  sky500: '#0EA5E9',
  violet400: '#A78BFA',

  slate25: '#FCFCFD',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',

  ink0: '#0B0B12',
  ink1: '#12121C',
  ink2: '#1A1A26',
  ink3: '#232333',
  ink4: '#2E2E42',

  white: '#FFFFFF',
  black: '#000000',
} as const;

/** Colours offered in the tag / project colour picker. */
export const swatches = [
  palette.indigo500,
  palette.sky500,
  palette.emerald500,
  palette.amber500,
  palette.rose500,
  palette.violet400,
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

export interface ThemeColors {
  background: string;
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
  accentSoft: string;
  accentContrast: string;
  overlay: string;
  danger: string;
  success: string;
  warning: string;
  priority: Record<'none' | 'low' | 'medium' | 'high' | 'urgent', string>;
  shadow: string;
}

export const lightColors: ThemeColors = {
  background: palette.slate50,
  surface: palette.white,
  surfaceElevated: palette.white,
  surfaceSunken: palette.slate100,
  border: palette.slate200,
  borderStrong: palette.slate300,
  textPrimary: palette.slate900,
  textSecondary: palette.slate500,
  textTertiary: palette.slate400,
  textInverse: palette.white,
  accent: palette.indigo500,
  accentSoft: palette.indigo50,
  accentContrast: palette.white,
  overlay: 'rgba(15, 23, 42, 0.45)',
  danger: palette.rose500,
  success: palette.emerald500,
  warning: palette.amber500,
  priority: {
    none: palette.slate400,
    low: palette.sky500,
    medium: palette.amber500,
    high: palette.rose500,
    urgent: palette.rose500,
  },
  shadow: 'rgba(15, 23, 42, 0.10)',
};

export const darkColors: ThemeColors = {
  background: palette.ink0,
  surface: palette.ink1,
  surfaceElevated: palette.ink2,
  surfaceSunken: palette.ink3,
  border: palette.ink3,
  borderStrong: palette.ink4,
  textPrimary: '#F5F6FA',
  textSecondary: palette.slate400,
  textTertiary: palette.slate500,
  textInverse: palette.ink0,
  accent: palette.indigo400,
  accentSoft: 'rgba(139, 124, 246, 0.16)',
  accentContrast: palette.ink0,
  overlay: 'rgba(0, 0, 0, 0.6)',
  danger: palette.rose400,
  success: palette.emerald400,
  warning: palette.amber400,
  priority: {
    none: palette.slate500,
    low: palette.sky400,
    medium: palette.amber400,
    high: palette.rose400,
    urgent: palette.rose400,
  },
  shadow: 'rgba(0, 0, 0, 0.5)',
};

export const typography = {
  display: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1 },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const, letterSpacing: -0.1 },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  micro: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.6 },
} as const;

export type TypographyToken = keyof typeof typography;
