import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';
import React, { useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import type { Priority, TaskWithTags } from '@/domain/types';
import { describeRecurrence } from '@/nlp/parser';
import { subtaskProgress } from '@/store/selectors';
import { useTheme } from '@/theme/ThemeProvider';
import { elevation } from '@/theme/tokens';
import { describeTask, toggleTaskLabel } from '@/utils/a11y';
import { success } from '@/utils/haptics';
import { clamp } from '@/utils/id';

import { Confetti, type ConfettiHandle } from './Confetti';
import { ProgressBar, Text } from './ui';

const SWIPE_THRESHOLD = 96;
const MAX_SWIPE = 132;

interface TaskCardProps {
  task: TaskWithTags;
  /** All tasks, used to compute subtask progress. */
  allTasks: TaskWithTags[];
  onToggle: (id: string) => void;
  onPress: (id: string) => void;
  onDelete?: (id: string) => void;
  onBreakDown?: (id: string) => void;
  depth?: number;
  compact?: boolean;
  /** Highlighted as part of a multi-select in the Inbox. */
  selected?: boolean;
}

export function formatDueLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  const day = isToday(date)
    ? 'Today'
    : isTomorrow(date)
      ? 'Tomorrow'
      : isYesterday(date)
        ? 'Yesterday'
        : format(date, 'EEE d MMM');
  return hasTime ? `${day} · ${format(date, 'h:mm a')}` : day;
}

export function isTaskOverdue(task: TaskWithTags): boolean {
  if (!task.dueAt || task.status === 'done') return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

export function TaskCard({
  task,
  allTasks,
  onToggle,
  onPress,
  onDelete,
  onBreakDown,
  depth = 0,
  selected = false,
}: TaskCardProps) {
  const theme = useTheme();
  const panX = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiHandle>(null);

  const done = task.status === 'done';
  const progress = useMemo(() => subtaskProgress(allTasks, task.id), [allTasks, task.id]);
  const overdue = isTaskOverdue(task);
  const dueLabel = formatDueLabel(task.dueAt);
  const priorityColor = theme.colors.priority[task.priority];

  /**
   * The card's metadata as words, not as a row of pills.
   *
   * Every attribute used to be its own outlined chip with an icon, so a task
   * with a date, a repeat, a priority and subtasks put four boxes under one
   * line of text. Same information, separated by a middot, reads in a glance
   * instead of needing to be scanned — and there is nothing to decode.
   */
  const meta = useMemo(() => {
    const parts: { key: string; text: string; color?: string }[] = [];
    if (dueLabel) {
      parts.push({
        key: 'due',
        text: dueLabel,
        color: overdue ? theme.colors.danger : undefined,
      });
    }
    if (task.recurrence) {
      parts.push({ key: 'repeat', text: describeRecurrence(task.recurrence) });
    }
    if (task.priority !== 'none') {
      parts.push({ key: 'priority', text: PRIORITY_LABEL[task.priority], color: priorityColor });
    }
    if (task.estimateMinutes) {
      parts.push({ key: 'estimate', text: `~${task.estimateMinutes}m` });
    }
    if (progress.total > 0) {
      parts.push({ key: 'steps', text: `${progress.done}/${progress.total}` });
    }
    return parts;
  }, [
    dueLabel,
    overdue,
    priorityColor,
    progress.done,
    progress.total,
    task.estimateMinutes,
    task.priority,
    task.recurrence,
    theme.colors.danger,
  ]);

  const complete = useCallback(() => {
    success();
    if (!done) confettiRef.current?.fire();
    onToggle(task.id);
  }, [done, onToggle, task.id]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderMove: (_event, gesture) => {
          panX.setValue(clamp(gesture.dx, -MAX_SWIPE, MAX_SWIPE));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            complete();
          } else if (gesture.dx < -SWIPE_THRESHOLD && onDelete) {
            onDelete(task.id);
          }
          Animated.spring(panX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 26,
            bounciness: 6,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(panX, {
            toValue: 0,
            useNativeDriver: true,
            speed: 26,
            bounciness: 6,
          }).start();
        },
      }),
    [complete, onDelete, panX, task.id],
  );

  const completeOpacity = panX.interpolate({
    inputRange: [0, 40, SWIPE_THRESHOLD],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });
  const deleteOpacity = panX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -40, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ marginLeft: depth * 14 }}>
      {/* Swipe action backdrops */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.backdrop,
          { opacity: completeOpacity, justifyContent: 'flex-start', borderRadius: theme.radii.xl },
        ]}
      >
        <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.backdrop,
          { opacity: deleteOpacity, justifyContent: 'flex-end', borderRadius: theme.radii.xl },
        ]}
      >
        <Ionicons name="trash" size={20} color={theme.colors.danger} />
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX: panX }],
          backgroundColor: selected
            ? theme.colors.accentSoft
            : done
              ? theme.colors.surfaceSunken
              : theme.colors.surface,
          borderRadius: theme.radii.lg,
          // Hairline by default; the accent border is the only state that
          // widens, so selection is unmistakable without every card wearing a
          // box. Overdue keeps a red hairline — the colour carries the warning.
          borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
          borderColor: selected
            ? theme.colors.accent
            : overdue
              ? theme.colors.danger
              : theme.colors.border,
          overflow: 'hidden',
          ...(done ? null : { ...elevation.card, shadowColor: theme.colors.shadow }),
        }}
      >
        <Pressable
          onPress={() => onPress(task.id)}
          onLongPress={onBreakDown ? () => onBreakDown(task.id) : undefined}
          accessibilityRole="button"
          // The card is one big target, so it names the task it opens —
          // otherwise a screen reader reads the row's fragments in sequence
          // with nothing tying them together.
          accessibilityLabel={describeTask({
            title: task.title,
            priority: task.priority,
            done,
          })}
          style={{ flexDirection: 'row', alignItems: 'stretch' }}
        >
          {/*
            Priority stripe — only when there *is* a priority. An unprioritised
            task used to carry a grey bar down its left edge, which is a
            graphic for "nothing here".
          */}
          {task.priority !== 'none' ? (
            <View
              style={{
                width: 3,
                marginVertical: theme.spacing.md,
                marginLeft: 2,
                borderRadius: 2,
                backgroundColor: priorityColor,
              }}
            />
          ) : null}

          <View style={{ flex: 1, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
              <Pressable
                onPress={complete}
                hitSlop={10}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={toggleTaskLabel(task.title, done)}
              >
                <Ionicons
                  name={done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={done ? theme.colors.success : theme.colors.borderStrong}
                />
              </Pressable>

              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  variant="bodyStrong"
                  color={done ? theme.colors.textTertiary : theme.colors.textPrimary}
                  style={done ? { textDecorationLine: 'line-through' } : undefined}
                  numberOfLines={2}
                >
                  {task.title}
                </Text>

                {meta.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                    {meta.map((part, index) => (
                      <View
                        key={part.key}
                        style={{ flexDirection: 'row', alignItems: 'center' }}
                      >
                        {index > 0 ? (
                          <Text variant="caption" color={theme.colors.textTertiary}>
                            {' · '}
                          </Text>
                        ) : null}
                        <Text
                          variant="caption"
                          color={part.color ?? theme.colors.textTertiary}
                          numberOfLines={1}
                        >
                          {part.text}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <Confetti ref={confettiRef} />
            </View>

            {progress.total > 0 ? (
              <ProgressBar ratio={progress.ratio} color={theme.colors.success} height={3} />
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const PRIORITY_LABEL: Record<Priority, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    // Radius is applied inline so the backdrop follows theme.radii.xl like the card.
    backgroundColor: 'transparent',
  },
});
