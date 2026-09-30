import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface ConfettiHandle {
  /** Fires a burst. Each call restarts the animation from the origin. */
  fire: () => void;
}

interface Particle {
  angle: number;
  distance: number;
  size: number;
  color: string;
  spin: number;
  fall: number;
}

const PARTICLE_COUNT = 18;

/**
 * Lightweight particle burst played when a task is completed.
 * Uses one Animated.Value for every particle and interpolates per-particle
 * transforms, so the whole effect costs a single animation driver.
 */
export const Confetti = forwardRef<ConfettiHandle, { origin?: 'center' | 'left' }>(
  function Confetti({ origin = 'left' }, ref) {
    const theme = useTheme();
    const progress = useRef(new Animated.Value(0)).current;
    const [runId, setRunId] = React.useState(0);
    const [visible, setVisible] = React.useState(false);

    const particles = useMemo<Particle[]>(() => {
      const colors = [
        theme.colors.accent,
        theme.colors.success,
        theme.colors.warning,
        theme.colors.danger,
        theme.swatches[2],
        theme.swatches[3],
      ];
      return Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const spread = origin === 'left' ? -0.35 : -0.5;
        return {
          angle: spread + (index / (PARTICLE_COUNT - 1)) * 1.0 - 0.5,
          distance: 46 + Math.random() * 62,
          size: 5 + Math.random() * 5,
          color: colors[index % colors.length],
          spin: (Math.random() - 0.5) * 2,
          fall: 24 + Math.random() * 46,
        };
      });
    }, [origin, theme]);

    const fire = useCallback(() => {
      progress.setValue(0);
      setVisible(true);
      setRunId((id) => id + 1);
      Animated.timing(progress, {
        toValue: 1,
        duration: 720,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }, [progress]);

    useImperativeHandle(ref, () => ({ fire }), [fire]);

    if (!visible) return null;

    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ position: 'absolute', left: origin === 'left' ? 28 : '50%', top: '50%' }}>
          {particles.map((particle, index) => {
            const translateX = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, Math.cos(particle.angle) * particle.distance],
            });
            const translateY = progress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, Math.sin(particle.angle) * -particle.distance + particle.fall],
            });
            const opacity = progress.interpolate({
              inputRange: [0, 0.15, 0.7, 1],
              outputRange: [0, 1, 0.9, 0],
            });
            const rotate = progress.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', `${particle.spin * 360}deg`],
            });
            const scale = progress.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: [0.2, 1, 0.7],
            });

            return (
              <Animated.View
                key={`${runId}-${index}`}
                style={{
                  position: 'absolute',
                  width: particle.size,
                  height: particle.size,
                  borderRadius: index % 3 === 0 ? particle.size / 2 : 2,
                  backgroundColor: particle.color,
                  opacity,
                  transform: [{ translateX }, { translateY }, { rotate }, { scale }],
                }}
              />
            );
          })}
        </View>
      </View>
    );
  },
);
