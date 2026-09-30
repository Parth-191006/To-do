import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { TaskStatus, TaskWithTags } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { tapLight } from '@/utils/haptics';

import { EmptyState, Text } from '../ui';

const COLUMNS: { status: TaskStatus; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { status: 'todo', label: 'To do', icon: 'ellipse-outline' },
  { status: 'in_progress', label: 'In progress', icon: 'time-outline' },
  { status: 'done', label: 'Done', icon: 'checkmark-circle-outline' },
];

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
  archived: 'todo',
};

interface KanbanBoardProps {
  tasks: TaskWithTags[];
  onOpen: (id: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
}

/**
 * Kanban board. Cards expose a one-tap "advance" control so the board stays
 * fully usable without a drag gesture, while the layout keeps the classic
 * column metaphor.
 */
export function KanbanBoard({ tasks, onOpen, onMove }: KanbanBoardProps) {
  const theme = useTheme();

  const byColumn = useMemo(() => {
    const map = new Map<TaskStatus, TaskWithTags[]>();
    for (const column of COLUMNS) map.set(column.status, []);
    for (const task of tasks) {
      if (task.parentId !== null) continue;
      const bucket = map.get(task.status === 'archived' ? 'todo' : task.status);
      bucket?.push(task);
    }
    return map;
  }, [tasks]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.md, paddingVertical: theme.spacing.sm }}
    >
      {COLUMNS.map((column) => {
        const items = byColumn.get(column.status) ?? [];
        return (
          <View
            key={column.status}
            style={{
              width: 268,
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radii.xl,
              padding: theme.spacing.md,
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={column.icon} size={14} color={theme.colors.textSecondary} />
              <Text variant="label" color={theme.colors.textSecondary}>
                {column.label}
              </Text>
              <View style={{ flex: 1 }} />
              <Text variant="caption" color={theme.colors.textTertiary}>
                {items.length}
              </Text>
            </View>

            {items.length === 0 ? (
              <Text variant="caption" color={theme.colors.textTertiary} style={{ paddingVertical: 12 }}>
                Nothing here yet.
              </Text>
            ) : (
              items.map((task) => (
                <Pressable
                  key={task.id}
                  onPress={() => onOpen(task.id)}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radii.lg,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.colors.border,
                    padding: theme.spacing.md,
                    gap: 8,
                  }}
                >
                  <Text variant="bodyStrong" numberOfLines={3}>
                    {task.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: theme.colors.priority[task.priority],
                      }}
                    />
                    <Text variant="micro" color={theme.colors.textTertiary}>
                      {task.priority === 'none' ? 'NO PRIORITY' : task.priority.toUpperCase()}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <Pressable
                      hitSlop={8}
                      onPress={() => {
                        tapLight();
                        onMove(task.id, NEXT_STATUS[task.status]);
                      }}
                    >
                      <Ionicons name="arrow-forward-circle-outline" size={20} color={theme.colors.accent} />
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}

            {items.length === 0 && column.status === 'todo' ? (
              <EmptyState icon="albums-outline" title="Board is clear" subtitle="Add a task to get started." />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
