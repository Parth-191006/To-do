import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnalyticsPanel } from '@/components/AnalyticsPanel';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { selection } from '@/utils/haptics';

const RANGES = [7, 14, 30] as const;

export default function InsightsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [windowDays, setWindowDays] = useState<number>(14);

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
  );
}
