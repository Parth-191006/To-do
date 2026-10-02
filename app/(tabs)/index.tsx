import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { TaskDashboard } from '@/components/TaskDashboard';
import { Text } from '@/components/ui';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function TodayScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const status = useStore((state) => state.status);

  if (status === 'loading' || status === 'idle') {
    return <OpeningWorkspace />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <BrandMark size={26} />
        <Text variant="bodyStrong">TaskFlow</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push('/settings')} hitSlop={10} accessibilityLabel="Settings">
          <Ionicons name="options-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={{ flex: 1, paddingHorizontal: theme.spacing.lg }}>
        <TaskDashboard />
      </View>
    </View>
  );
}

/**
 * Boot surface. The pulsing mark doubles as the activity indicator, so the
 * first thing the user sees is the app's own identity rather than a spinner.
 */
function OpeningWorkspace() {
  const theme = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xl,
      }}
    >
      <Animated.View
        style={{
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
          ],
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
          shadowColor: theme.colors.accent,
          shadowOpacity: 0.4,
          shadowRadius: 26,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        <BrandMark size={76} />
      </Animated.View>
      <Text variant="caption" color={theme.colors.textSecondary}>
        Opening your workspace…
      </Text>
    </View>
  );
}
