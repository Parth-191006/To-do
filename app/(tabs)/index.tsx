import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text variant="caption" color={theme.colors.textSecondary}>
          Opening your workspace…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Text variant="label" color={theme.colors.accent}>
          TASKFLOW
        </Text>
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
