import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

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

/**
 * Compact icon-only segmented control that swaps the four task layouts.
 *
 * The previous version spelled out LIST / BOARD / AGENDA / MATRIX in uppercase
 * at 10 px, which cost a full 44 px row on the Today screen and pushed the first
 * task below the fold on a small phone. The label of the *active* view is kept
 * as a caption next to it, so the setting is still named — and every icon
 * carries its name for TalkBack.
 */
export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const theme = useTheme();
  const active = VIEWS.find((view) => view.key === value) ?? VIEWS[0];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
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
          const selected = view.key === value;
          return (
            <Pressable
              key={view.key}
              onPress={() => {
                selection();
                onChange(view.key);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`${view.label} view`}
              accessibilityState={{ selected }}
              style={{
                width: 44,
                height: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radii.pill,
                backgroundColor: selected ? theme.colors.surface : 'transparent',
                ...(selected
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
                size={17}
                color={selected ? theme.colors.accent : theme.colors.textTertiary}
              />
            </Pressable>
          );
        })}
      </View>
      <Text variant="micro" color={theme.colors.textTertiary} numberOfLines={1}>
        {active.label.toUpperCase()}
      </Text>
    </View>
  );
}
