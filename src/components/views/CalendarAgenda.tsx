import { Ionicons } from '@expo/vector-icons';
import { addDays, format, isSameDay, parseISO, startOfDay } from 'date-fns';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { TaskWithTags } from '@/domain/types';
import { useTheme } from '@/theme/ThemeProvider';
import { describeTask, toggleTaskLabel } from '@/utils/a11y';
import { success } from '@/utils/haptics';

import { Text } from '../ui';

/** Spoken + visible due time: midnight is an all-day task, otherwise a clock. */
function dueText(iso: string): string {
  const date = parseISO(iso);
  return date.getHours() === 0 && date.getMinutes() === 0 ? 'All day' : format(date, 'h:mm a');
}

interface CalendarAgendaProps {
  tasks: TaskWithTags[];
  days?: number;
  onOpen: (id: string) => void;
  /** Completes (or re-opens) a task without leaving the agenda. */
  onToggle: (id: string) => void;
}

/**
 * The agenda's completion control.
 *
 * List has swipe-to-complete and Board has an advance arrow, but the agenda
 * only had "open the task" — finishing anything from this view meant a bounce
 * through the detail screen. This is the same checkbox the list uses, down to
 * the label verb (`toggleTaskLabel`), so the gesture reads identically
 * everywhere.
 */
function CompleteBox({
  title,
  done,
  onToggle,
}: {
  title: string;
  done: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      hitSlop={10}
      onPress={() => {
        success();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={toggleTaskLabel(title, done)}
    >
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={done ? theme.colors.success : theme.colors.borderStrong}
      />
    </Pressable>
  );
}

/**
 * Rolling agenda: the next N days grouped by date, with an "Anytime" bucket
 * for tasks that have no due date so nothing silently disappears.
 */
export function CalendarAgenda({ tasks, days = 14, onOpen, onToggle }: CalendarAgendaProps) {
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
                // min-* rather than fixed: at 200% text "SEP" overflows a
                // hard 40dp box, and the badge is allowed to grow with it.
                minWidth: 40,
                minHeight: 40,
                paddingHorizontal: 4,
                paddingVertical: 4,
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
            group.items.map((task) => {
              const done = task.status === 'done';
              return (
                <Pressable
                  key={task.id}
                  onPress={() => onOpen(task.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${describeTask({
                    title: task.title,
                    priority: task.priority,
                    done,
                  })}${task.dueAt ? `, due ${dueText(task.dueAt)}` : ''}. Opens the task.`}
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
                    <Text
                      variant="body"
                      numberOfLines={2}
                      color={done ? theme.colors.textTertiary : theme.colors.textPrimary}
                      style={done ? { textDecorationLine: 'line-through' } : undefined}
                    >
                      {task.title}
                    </Text>
                    {task.dueAt ? (
                      <Text variant="caption" color={theme.colors.textTertiary}>
                        {dueText(task.dueAt)}
                      </Text>
                    ) : null}
                  </View>
                  <CompleteBox
                    title={task.title}
                    done={done}
                    onToggle={() => onToggle(task.id)}
                  />
                </Pressable>
              );
            })
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
              accessibilityRole="button"
              accessibilityLabel={`${describeTask({
                title: task.title,
                priority: task.priority,
                done: task.status === 'done',
              })}. Opens the task.`}
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
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {task.title}
              </Text>
              <CompleteBox
                title={task.title}
                done={task.status === 'done'}
                onToggle={() => onToggle(task.id)}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
