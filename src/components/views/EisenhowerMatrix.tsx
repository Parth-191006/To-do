import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TaskWithTags } from '@/domain/types';
import { eisenhowerQuadrants } from '@/store/selectors';
import { useTheme } from '@/theme/ThemeProvider';
import { toggleTaskLabel } from '@/utils/a11y';
import { success } from '@/utils/haptics';

import { Text } from '../ui';

interface EisenhowerMatrixProps {
  tasks: TaskWithTags[];
  onOpen: (id: string) => void;
  /** Completes (or re-opens) a task without leaving the matrix. */
  onToggle: (id: string) => void;
}

/**
 * Eisenhower matrix. Importance is derived from priority, urgency from the due
 * date, so no extra user input is required — the view is a lens over data the
 * user already provided.
 */
export function EisenhowerMatrix({ tasks, onOpen, onToggle }: EisenhowerMatrixProps) {
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
                cell.items.slice(0, 4).map((task) => {
                  const done = task.status === 'done';
                  return (
                    // Quadrants hold open tasks only (`isOpen`), so ticking a row
                    // clears it out of the cell — the same "advance and move on"
                    // feel as the board's arrow. Before this the matrix was
                    // read-only: finishing something meant opening it.
                    <View
                      key={task.id}
                      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}
                    >
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          success();
                          onToggle(task.id);
                        }}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: done }}
                        accessibilityLabel={toggleTaskLabel(task.title, done)}
                      >
                        <Ionicons
                          name={done ? 'checkmark-circle' : 'ellipse-outline'}
                          size={14}
                          color={done ? theme.colors.success : theme.colors.borderStrong}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => onOpen(task.id)}
                        accessibilityRole="button"
                        style={{ flex: 1 }}
                        // The cell's own heading and subtitle are read
                        // separately, so the row announces which quadrant the
                        // task is in rather than relying on the checkbox it
                        // happens to sit next to.
                        accessibilityLabel={`${task.title}. ${cell.title} — ${cell.subtitle}. Opens the task.`}
                      >
                        <Text variant="caption" numberOfLines={2}>
                          {task.title}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
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
