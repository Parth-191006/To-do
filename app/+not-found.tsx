import { Link } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';

export default function NotFoundScreen() {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xl,
      }}
    >
      <EmptyState
        icon="compass-outline"
        title="This screen does not exist"
        subtitle="The link may be stale or the task was deleted."
      />
      <Link href="/" style={{ color: theme.colors.accent, fontWeight: '700' }}>
        Go to Today
      </Link>
    </View>
  );
}
