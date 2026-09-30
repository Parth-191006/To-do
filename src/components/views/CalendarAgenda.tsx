import { Ionicons } from '@expo/vector-icons';
import { addDays, format, isSameDay, parseISO, startOfDay } from 'date-fns';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TaskWithTags } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from '../ui';

interface CalendarAgendaProps {
  tasks: TaskWithTags[];
  days?: number;
  onOpen: (id: string) => void;
}

/**
 * Rolling agenda: the next N days grouped by date, with an "Anytime" bucket
 * for tasks that have no due date so nothing silently disappears.
 */
export function CalendarAgenda({ tasks, days = 14, onOpen }: CalendarAgendaProps) {
  const theme = useTheme();

  const { groups, undated } = useMemo(() => {
    const start = startOfDay(new Date());
    const buckets = Array.from({ length: days }, (_, offset) => {
      const date = addDays(start, offset);
      return {
        date,
        key: format(date, 'yyyy-MM-dd'),
        items: [] as TaskWithTags[],
      };
    });

    const mapped = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    const noDate: TaskWithTags[] = [];

    for (const task of tasks) {
      if (task.parentId !== null) continue;
      if (!task.dueAt) {
        if (task.status !== 'done') noDate.push(task);
        continue;
      }
      const due = parseISO(task.dueAt);
      if (Number.isNaN(due.getTime())) continue;
      const bucket =
        mapped.get(format(due, 'yyyy-MM-dd')) ??
        (isSameDay(due, start) ? mapped.get(format(start, 'yyyy-MM-dd')) : undefined);
      if (bucket) bucket.items.push(task);
      else if (due.getTime() < start.getTime() && task.status !== 'done') {
        // Overdue tasks surface on today's row rather than vanishing.
        buckets[0].items.push(task);
      }
    }

    return { groups: buckets, undated: noDate };
  }, [days, tasks]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {groups.map((group, index) => (
        <View key={group.key} style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: theme.radii.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: index === 0 ? theme.colors.accent : theme.colors.surfaceSunken,
              }}
            >
              <Text
                variant="micro"
                color={index === 0 ? theme.colors.accentContrast : theme.colors.textTertiary}
              >
                {format(group.date, 'EEE').toUpperCase()}
              </Text>
              <Text
                variant="bodyStrong"
                color={index === 0 ? theme.colors.accentContrast : theme.colors.textPrimary}
              >
                {format(group.date, 'd')}
              </Text>
            </View>
            <Text variant="label" color={theme.colors.textSecondary}>
              {index === 0 ? 'Today' : format(group.date, 'EEEE d MMMM')}
            </Text>
            <View style={{ flex: 1 }} />
            <Text variant="caption" color={theme.colors.textTertiary}>
              {group.items.length || ''}
            </Text>
          </View>

          {group.items.length === 0 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: theme.colors.border,
                marginLeft: 52,
              }}
            />
          ) : (
            group.items.map((task) => (
              <Pressable
                key={task.id}
                onPress={() => onOpen(task.id)}
                style={{
                  marginLeft: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radii.md,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.colors.border,
                  paddingVertical: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                }}
              >
                <View
                  style={{
                    width: 3,
                    height: 26,
                    borderRadius: 2,
                    backgroundColor: theme.colors.priority[task.priority],
                  }}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="body" numberOfLines={2}>
                    {task.title}
                  </Text>
                  {task.dueAt ? (
                    <Text variant="caption" color={theme.colors.textTertiary}>
                      {new Date(task.dueAt).getHours() === 0 && new Date(task.dueAt).getMinutes() === 0
                        ? 'All day'
                        : format(parseISO(task.dueAt), 'h:mm a')}
                    </Text>
                  ) : null}
                </View>
                {task.status === 'done' ? (
                  <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      ))}

      {undated.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color={theme.colors.textSecondary}>
            Anytime
          </Text>
          {undated.slice(0, 12).map((task) => (
            <Pressable
              key={task.id}
              onPress={() => onOpen(task.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.md,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                paddingVertical: theme.spacing.sm,
                paddingHorizontal: theme.spacing.md,
              }}
            >
              <Ionicons name="ellipse-outline" size={14} color={theme.colors.borderStrong} />
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {task.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
