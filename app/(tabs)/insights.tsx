import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export default function InsightsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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
        <Text variant="title">Insights</Text>
        <Text variant="caption" color={theme.colors.textSecondary}>
          Where your time and completions actually go.
        </Text>
      </View>
      <AnalyticsPanel windowDays={14} />
    </ScrollView>
  );
}
