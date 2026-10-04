import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HabitTracker } from '@/components/HabitTracker';
import { SkeletonList } from '@/components/Skeleton';
import { TabHeader } from '@/components/TabHeader';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function HabitsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const status = useStore((state) => state.status);

  // Skeletons while SQLite opens, so the layout does not jump when habits land.
  if (status === 'loading' || status === 'idle') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <TabHeader title="Habits" subtitle="Daily check-ins, streaks and a 5-week heatmap." />
        <SkeletonList rows={3} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TabHeader title="Habits" subtitle="Daily check-ins, streaks and a 5-week heatmap." />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + 110,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <HabitTracker onOpenAnalytics={() => router.push('/insights')} />
      </ScrollView>
    </View>
  );
}
