import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HabitTracker } from '@/components/HabitTracker';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export default function HabitsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: insets.bottom + 110,
        gap: theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: 2 }}>
        <Text variant="title">Habits</Text>
        <Text variant="caption" color={theme.colors.textSecondary}>
          Daily check-ins, streaks and a 5-week heatmap.
        </Text>
      </View>
      <HabitTracker onOpenAnalytics={() => router.push('/insights')} />
    </ScrollView>
  );
}
