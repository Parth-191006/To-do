import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TaskWithTags } from '@/domain/types';
import { eisenhowerQuadrants } from '@/store/selectors';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from '../ui';

interface EisenhowerMatrixProps {
  tasks: TaskWithTags[];
  onOpen: (id: string) => void;
}

/**
 * Eisenhower matrix. Importance is derived from priority, urgency from the due
 * date, so no extra user input is required — the view is a lens over data the
 * user already provided.
 */
export function EisenhowerMatrix({ tasks, onOpen }: EisenhowerMatrixProps) {
  const theme = useTheme();
  const quadrants = useMemo(() => eisenhowerQuadrants(tasks), [tasks]);

  const cells = [
    {
      key: 'do',
      title: 'Do first',
      subtitle: 'Urgent + important',
      items: quadrants.urgentImportant,
      color: theme.colors.danger,
    },
    {
      key: 'schedule',
      title: 'Schedule',
      subtitle: 'Important, not urgent',
      items: quadrants.notUrgentImportant,
      color: theme.colors.accent,
    },
    {
      key: 'delegate',
      title: 'Delegate',
      subtitle: 'Urgent, not important',
      items: quadrants.urgentNotImportant,
      color: theme.colors.warning,
    },
    {
      key: 'later',
      title: 'Eliminate',
      subtitle: 'Neither',
      color: theme.colors.textTertiary,
      items: quadrants.neither,
    },
  ];

  return (
    <View style={{ gap: theme.spacing.md }}>
      {[0, 2].map((rowStart) => (
        <View key={rowStart} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          {cells.slice(rowStart, rowStart + 2).map((cell) => (
            <View
              key={cell.key}
              style={{
                flex: 1,
                minHeight: 172,
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.lg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                borderTopWidth: 3,
                borderTopColor: cell.color,
                padding: theme.spacing.md,
                gap: theme.spacing.sm,
              }}
            >
              <View>
                <Text variant="label">{cell.title}</Text>
                <Text variant="micro" color={theme.colors.textTertiary}>
                  {cell.subtitle.toUpperCase()}
                </Text>
              </View>

              {cell.items.length === 0 ? (
                <Text variant="caption" color={theme.colors.textTertiary}>
                  Empty
                </Text>
              ) : (
                cell.items.slice(0, 4).map((task) => (
                  <Pressable key={task.id} onPress={() => onOpen(task.id)}>
                    <Text variant="caption" numberOfLines={2}>
                      • {task.title}
                    </Text>
                  </Pressable>
                ))
              )}

              {cell.items.length > 4 ? (
                <Text variant="micro" color={theme.colors.textTertiary}>
                  +{cell.items.length - 4} MORE
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
