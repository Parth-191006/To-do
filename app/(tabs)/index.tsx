import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { SkeletonList } from '@/components/Skeleton';
import { TabHeader } from '@/components/TabHeader';
import { TaskDashboard } from '@/components/TaskDashboard';
import { Text } from '@/components/ui';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const status = useStore((state) => state.status);

  if (status === 'loading' || status === 'idle') {
    return <OpeningWorkspace />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* The mascot leads the header, matching the launcher icon. */}
      <TabHeader
        title="TaskFlow"
        right={
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            style={{
              width: 48,
              height: 48,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="options-outline" size={21} color={theme.colors.textSecondary} />
          </Pressable>
        }
      />

      <View style={{ flex: 1, paddingHorizontal: theme.spacing.lg }}>
        <TaskDashboard />
      </View>
    </View>
  );
}

/**
 * Boot surface: the masthead, then skeletons shaped like the day ahead.
 *
 * The old version was a centred pulsing logo on an empty screen — it told the
 * user nothing about what was coming. The skeleton keeps the layout stable the
 * moment the database opens, so the first task does not jump when it lands.
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
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View
        style={{
          paddingTop: theme.spacing['2xl'],
          alignItems: 'center',
          gap: theme.spacing.md,
        }}
      >
        <Animated.View
          style={{
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
            ],
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
            shadowColor: theme.colors.accent,
            shadowOpacity: 0.4,
            shadowRadius: 26,
            shadowOffset: { width: 0, height: 12 },
          }}
        >
          <BrandMark size={72} />
        </Animated.View>
        <Text variant="caption" color={theme.colors.textSecondary}>
          Opening your workspace…
        </Text>
      </View>
      <View style={{ paddingTop: theme.spacing.xl }}>
        <SkeletonList rows={3} />
      </View>
    </View>
  );
}
