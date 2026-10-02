import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { clamp } from '@/utils/id';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Tween the arc to the new value instead of snapping to it. */
  animated?: boolean;
  /** Tween length in ms. */
  duration?: number;
  children?: React.ReactNode;
}

/**
 * Circular progress used by the focus timer and project headers.
 *
 * The arc is tweened rather than snapped: the timer re-derives progress several
 * times a second, and without a tween each step visibly stepped the stroke
 * instead of sweeping it.
 */
export function ProgressRing({
  progress,
  size = 76,
  strokeWidth = 8,
  color,
  trackColor,
  animated = true,
  duration = 600,
  children,
}: ProgressRingProps) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = clamp(progress, 0, 1);

  // Starts at 0 so the ring sweeps in on first paint.
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) {
      sweep.setValue(value);
      return;
    }
    const animation = Animated.timing(sweep, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      // react-native-svg geometry props are not supported by the native driver.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animated, duration, sweep, value]);

  const dashOffset = animated
    ? sweep.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })
    : circumference * (1 - value);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? theme.colors.surfaceSunken}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color ?? theme.colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          // Start the arc at 12 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}
