import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { SkeletonList } from '@/components/Skeleton';
import { TabHeader } from '@/components/TabHeader';
import { Text } from '@/components/ui';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { selection } from '@/utils/haptics';

const RANGES = [7, 14, 30] as const;

export default function InsightsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const status = useStore((state) => state.status);
  const [windowDays, setWindowDays] = useState<number>(14);

  if (status === 'loading' || status === 'idle') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <TabHeader
          title="Insights"
          subtitle="Where your time and completions actually go."
        />
        <SkeletonList rows={3} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TabHeader title="Insights" subtitle="Where your time and completions actually go." />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + 110,
          gap: theme.spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Range picker — the charts are only as useful as the window you read them in. */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radii.pill,
          padding: 3,
          gap: 2,
        }}
      >
        {RANGES.map((range) => {
          const active = range === windowDays;
          return (
            <Pressable
              key={range}
              onPress={() => {
                if (active) return;
                selection();
                setWindowDays(range);
              }}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                borderRadius: theme.radii.pill,
                backgroundColor: active ? theme.colors.surface : 'transparent',
                ...(active
                  ? {
                      shadowColor: theme.colors.shadow,
                      shadowOpacity: 0.16,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 1,
                    }
                  : null),
              }}
            >
              <Text
                variant="micro"
                color={active ? theme.colors.accent : theme.colors.textTertiary}
              >
                {range} DAYS
              </Text>
            </Pressable>
          );
        })}
      </View>

        <AnalyticsPanel windowDays={windowDays} />
      </ScrollView>
    </View>
  );
}
