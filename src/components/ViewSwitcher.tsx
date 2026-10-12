import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import type { TaskView } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { selection } from '@/utils/haptics';

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
 * Icon-only, with no caption naming the current view: the selected segment is
 * already a filled chip under the finger, and the word beside it ("LIST") was
 * a third way of saying what the highlight says. Every icon keeps its name for
 * TalkBack.
 */
export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                width: 42,
                height: 34,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radii.pill,
                backgroundColor: selected ? theme.colors.surface : 'transparent',
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
    </View>
  );
}
