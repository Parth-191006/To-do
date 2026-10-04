import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './ui';

interface TabHeaderProps {
  title: string;
  subtitle?: string;
  /** Right-aligned controls (counters, actions). */
  right?: React.ReactNode;
}

/**
 * One header for every tab.
 *
 * Each screen used to hand-roll its own: Today started with a greeting block,
 * Inbox with a title plus a counter, Focus/Habits/Insights with `insets.top +
 * spacing.lg`. The result was four different top paddings and two different
 * title sizes, which read as four different apps. This fixes the padding, the
 * type scale and the spacing in one place.
 */
export function TabHeader({ title, subtitle, right }: TabHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.sm,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
