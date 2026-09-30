import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useRef } from 'react';
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
import type { TypographyToken } from '@/theme/tokens';
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
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: padded ? theme.spacing.lg : 0,
          // Cards carry a little weight even when not explicitly elevated — a
          // hairline border alone on a flat background read as unfinished.
          shadowColor: theme.colors.shadow,
          shadowOpacity: elevated ? 0.22 : 0.1,
          shadowRadius: elevated ? 22 : 12,
          shadowOffset: { width: 0, height: elevated ? 10 : 5 },
          elevation: elevated ? 4 : 1,
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
}

export function Chip({
  label,
  color,
  icon,
  selected = false,
  onPress,
  onLongPress,
  compact = false,
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
        paddingVertical: compact ? 3 : 6,
        paddingHorizontal: compact ? 8 : 11,
        borderRadius: theme.radii.pill,
        backgroundColor: selected ? background : theme.colors.surfaceSunken,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: selected ? accent : theme.colors.border,
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
    <Pressable onPress={onPress} onLongPress={onLongPress} hitSlop={6}>
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
/*                                EmptyState                                  */
/* -------------------------------------------------------------------------- */

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon = 'sparkles-outline', title, subtitle, action }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing['2xl'], gap: theme.spacing.sm }}>
      <LinearGradient
        colors={theme.colors.accentGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: theme.spacing.xs,
        }}
      >
        <Ionicons name={icon} size={27} color={theme.colors.accentContrast} />
      </LinearGradient>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" color={theme.colors.textSecondary} align="center" style={{ maxWidth: 280 }}>
          {subtitle}
        </Text>
      ) : null}
      {action ? <Chip label={action.label} selected onPress={action.onPress} /> : null}
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
