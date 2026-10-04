import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/**
 * Skeleton loaders.
 *
 * The app opens a SQLite database before it can show anything, which on a cold
 * start with a large task list is long enough to notice. A skeleton shaped like
 * the content that is about to appear beats a spinner: the layout does not jump
 * when the data lands.
 */

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 14, radius = 7, style }: SkeletonProps) {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceSunken,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
        },
        style,
      ]}
    />
  );
}

/** A screen-shaped skeleton: header, capture card, chips, then task cards. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.lg, paddingHorizontal: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Skeleton width="55%" height={28} radius={10} />
        <Skeleton width="35%" height={12} />
      </View>
      <View
        style={{
          gap: theme.spacing.md,
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.lg,
        }}
      >
        <Skeleton width="30%" height={11} />
        <Skeleton width="80%" height={20} />
        <Skeleton width="45%" height={34} radius={17} />
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Skeleton width={70} height={34} radius={17} />
        <Skeleton width={92} height={34} radius={17} />
        <Skeleton width={78} height={34} radius={17} />
      </View>
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          style={{
            gap: theme.spacing.sm,
            borderRadius: theme.radii.xl,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: theme.spacing.lg,
          }}
        >
          <Skeleton width={`${72 - index * 6}%`} height={16} />
          <Skeleton width="38%" height={12} />
        </View>
      ))}
    </View>
  );
}
