import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FocusTimer } from '@/components/FocusTimer';
import { SkeletonList } from '@/components/Skeleton';
import { TabHeader } from '@/components/TabHeader';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function FocusScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const status = useStore((state) => state.status);

  if (status === 'loading' || status === 'idle') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <TabHeader
          title="Focus"
          subtitle="Pomodoro blocks linked to the task you are working on."
        />
        <SkeletonList rows={2} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TabHeader
        title="Focus"
        subtitle="Pomodoro blocks linked to the task you are working on."
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + 110,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <FocusTimer />
      </ScrollView>
    </View>
  );
}
