import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef } from 'react';

import { BrandMark } from './BrandMark';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { elevation, type TypographyToken } from '@/theme/tokens';
import { tapLight } from '@/utils/haptics';

/* -------------------------------------------------------------------------- */
/*                                   Text                                     */
/* -------------------------------------------------------------------------- */

interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function Text({ variant = 'body', color, align, style, ...rest }: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        theme.typography[variant],
        { color: color ?? theme.colors.textPrimary, textAlign: align },
        style,
      ]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Card                                     */
/* -------------------------------------------------------------------------- */

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}

export function Card({ children, style, padded = true, elevated = false }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surface,
          borderRadius: theme.radii.xl,
          // A panel gets a shadow *or* a border, never both. Two hairlines 8px
          // apart is what made a list of panels read as a form.
          borderWidth: elevated ? 0 : StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: padded ? theme.spacing.lg : 0,
          ...(elevated
            ? { ...elevation.floating, shadowColor: theme.colors.shadow }
            : { ...elevation.card, shadowColor: theme.colors.shadow }),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Chip                                     */
/* -------------------------------------------------------------------------- */

interface ChipProps {
  label: string;
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  compact?: boolean;
  /** Spoken label when the visible text alone is ambiguous (e.g. "S", "M"). */
  accessibilityLabel?: string;
}

export function Chip({
  label,
  color,
  icon,
  selected = false,
  onPress,
  onLongPress,
  compact = false,
  accessibilityLabel,
}: ChipProps) {
  const theme = useTheme();
  const accent = color ?? theme.colors.accent;
  const background = selected ? accent : theme.colors.surfaceSunken;

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        // 48dp is the Android touch-target floor; a compact chip is a visual
        // size, so the padding keeps the tappable box big enough either way.
        minHeight: compact ? 30 : 34,
        paddingVertical: compact ? 5 : 7,
        paddingHorizontal: compact ? 9 : 12,
        borderRadius: theme.radii.pill,
        // Unselected chips are a flat tint with no outline. A pill with a
        // border around it draws a box for information that is often just a
        // word (a date, a tag) — six of them in a row is a wall of boxes.
        backgroundColor: selected ? background : theme.colors.surfaceSunken,
        borderWidth: 0,
      }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={compact ? 11 : 13}
          color={selected ? theme.colors.accentContrast : accent}
        />
      ) : null}
      <Text
        variant={compact ? 'micro' : 'caption'}
        color={selected ? theme.colors.accentContrast : theme.colors.textSecondary}
        style={compact ? undefined : { fontWeight: '600' }}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
    >
      {content}
    </Pressable>
  );
}

/** Small dot used to preview tag / project colours. */
export function ColorDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Divider                                    */
/* -------------------------------------------------------------------------- */

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.border,
        marginLeft: inset,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                ProgressBar                                 */
/* -------------------------------------------------------------------------- */

/**
 * The app's only linear progress indicator: a 4px track with a rounded fill.
 * Used for the day's completion, subtask progress and habit strength.
 */
export function ProgressBar({
  ratio,
  color,
  height = 4,
}: {
  ratio: number;
  color?: string;
  height?: number;
}) {
  const theme = useTheme();
  const width = `${Math.round(clampRatio(ratio) * 100)}%` as `${number}%`;
  return (
    <View
      accessibilityRole="progressbar"
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: theme.colors.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      <View
        style={{ width, height: '100%', backgroundColor: color ?? theme.colors.accent }}
      />
    </View>
  );
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

/* -------------------------------------------------------------------------- */
/*                               SectionLabel                                 */
/* -------------------------------------------------------------------------- */

/**
 * A list section heading: a small colour dot, the name, and an optional count.
 *
 * Sentence case, not shouted caps, and the count stays plain text rather than
 * becoming another pill — the heading is a waypoint in a list, not a control.
 */
export function SectionLabel({
  label,
  count,
  tint,
}: {
  label: string;
  count?: number;
  tint?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: tint ?? theme.colors.accent,
        }}
      />
      <Text variant="caption" color={tint ?? theme.colors.textSecondary} style={{ fontWeight: '600' }}>
        {label}
      </Text>
      {typeof count === 'number' ? (
        <Text variant="caption" color={theme.colors.textTertiary}>
          {count}
        </Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Button                                    */
/* -------------------------------------------------------------------------- */

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** `primary` is the filled accent pill; `quiet` is the text-only escape hatch. */
  variant?: 'primary' | 'quiet';
  accessibilityLabel?: string;
  testID?: string;
}

/** One button, two weights — so a screen never grows a third button style. */
export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 48,
        paddingHorizontal: primary ? theme.spacing.xl : theme.spacing.sm,
        borderRadius: theme.radii.pill,
        backgroundColor: primary ? theme.colors.accent : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={17}
          color={primary ? theme.colors.accentContrast : theme.colors.textSecondary}
        />
      ) : null}
      <Text
        variant="bodyStrong"
        color={primary ? theme.colors.accentContrast : theme.colors.textSecondary}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*                                EmptyState                                  */
/* -------------------------------------------------------------------------- */

interface EmptyStateProps {
  /** Small badge shown on the mascot, so the screen still names its topic. */
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  /** Extra controls under the copy — e.g. example tasks that add themselves. */
  children?: React.ReactNode;
  /** `false` for the compact boards, where the full mascot is too loud. */
  showMark?: boolean;
}

/**
 * Celebrates "nothing to do here" with the app's own mascot instead of a
 * generic icon in a circle: the character that appears on the launcher is the
 * same one that greets an empty day.
 */
export function EmptyState({
  icon = 'sparkles-outline',
  title,
  subtitle,
  action,
  children,
  showMark = true,
}: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View
      style={{ alignItems: 'center', paddingVertical: theme.spacing.xl, gap: theme.spacing.sm }}
    >
      {showMark ? (
        <View style={{ marginBottom: theme.spacing.xs }}>
          <BrandMark size={56} />
          <View
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.surface,
            }}
          >
            <Ionicons name={icon} size={13} color={theme.colors.textSecondary} />
          </View>
        </View>
      ) : null}
      <Text variant="heading" align="center">
        {title}
      </Text>
      {subtitle ? (
        <Text
          variant="caption"
          color={theme.colors.textSecondary}
          align="center"
          style={{ maxWidth: 260 }}
        >
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: theme.spacing.xs }}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 ScalePress                                 */
/* -------------------------------------------------------------------------- */

interface ScalePressProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  scaleTo?: number;
}

/** Pressable that springs down on touch — the app's core tactile feedback. */
export function ScalePress({
  children,
  style,
  haptic = true,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: ScalePressProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = useCallback(
    (toValue: number, duration: number) => {
      Animated.spring(scale, {
        toValue,
        useNativeDriver: true,
        speed: 40,
        bounciness: 6,
      }).start();
    },
    [scale],
  );

  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        animate(scaleTo, 100);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(1, 140);
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (haptic) tapLight();
        onPress?.(event);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
