import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TaskView } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { selection } from '@/utils/haptics';

import { Text } from './ui';

const VIEWS: { key: TaskView; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'list', label: 'List', icon: 'list-outline' },
  { key: 'kanban', label: 'Board', icon: 'albums-outline' },
  { key: 'calendar', label: 'Agenda', icon: 'calendar-outline' },
  { key: 'matrix', label: 'Matrix', icon: 'grid-outline' },
];

interface ViewSwitcherProps {
  value: TaskView;
  onChange: (view: TaskView) => void;
}

/** Segmented control that swaps between the four task layouts. */
export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radii.pill,
        padding: 3,
        gap: 2,
      }}
    >
      {VIEWS.map((view) => {
        const active = view.key === value;
        return (
          <Pressable
            key={view.key}
            onPress={() => {
              selection();
              onChange(view.key);
            }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              paddingVertical: 7,
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
            <Ionicons
              name={view.icon}
              size={14}
              color={active ? theme.colors.accent : theme.colors.textTertiary}
            />
            <Text
              variant="micro"
              color={active ? theme.colors.textPrimary : theme.colors.textTertiary}
              style={styles.label}
            >
              {view.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { textTransform: 'uppercase' },
});
