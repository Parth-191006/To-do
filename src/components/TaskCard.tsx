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
import { success, tapLight } from '@/utils/haptics';
import { clamp } from '@/utils/id';

import { Confetti, type ConfettiHandle } from './Confetti';
import { Chip, Text } from './ui';

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
}: TaskCardProps) {
  const theme = useTheme();
  const panX = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiHandle>(null);

  const done = task.status === 'done';
  const progress = useMemo(() => subtaskProgress(allTasks, task.id), [allTasks, task.id]);
  const overdue = isTaskOverdue(task);
  const dueLabel = formatDueLabel(task.dueAt);
  const priorityColor = theme.colors.priority[task.priority];

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
        style={[styles.backdrop, { opacity: completeOpacity, justifyContent: 'flex-start' }]}
      >
        <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.backdrop, { opacity: deleteOpacity, justifyContent: 'flex-end' }]}
      >
        <Ionicons name="trash" size={20} color={theme.colors.danger} />
      </Animated.View>

      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX: panX }],
          backgroundColor: done ? theme.colors.surfaceSunken : theme.colors.surface,
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: overdue ? theme.colors.danger : theme.colors.border,
          overflow: 'hidden',
          shadowColor: theme.colors.shadow,
          shadowOpacity: done ? 0 : 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: done ? 0 : 1,
        }}
      >
        <Pressable
          onPress={() => onPress(task.id)}
          onLongPress={onBreakDown ? () => onBreakDown(task.id) : undefined}
          style={{ flexDirection: 'row', alignItems: 'stretch' }}
        >
          {/* Priority stripe */}
          <View
            style={{
              width: 5,
              backgroundColor:
                task.priority === 'none'
                  ? theme.colors.border
                  : theme.colors.prioritySoft[task.priority],
              borderRightWidth: task.priority === 'none' ? 0 : 1,
              borderRightColor: theme.colors.border,
            }}
          >
            <View
              style={{
                width: 5,
                height: 26,
                marginTop: theme.spacing.md,
                backgroundColor: task.priority === 'none' ? theme.colors.border : priorityColor,
                borderTopRightRadius: 4,
                borderBottomRightRadius: 4,
              }}
            />
          </View>

          <View style={{ flex: 1, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.md, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
              <Pressable
                onPress={complete}
                hitSlop={10}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
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

                {(dueLabel || task.recurrence || progress.total > 0 || task.tagIds.length > 0) && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {dueLabel ? (
                      <Chip
                        label={dueLabel}
                        compact
                        icon={overdue ? 'alert-circle-outline' : 'calendar-outline'}
                        color={overdue ? theme.colors.danger : theme.colors.textSecondary}
                      />
                    ) : null}
                    {task.recurrence ? (
                      <Chip
                        label={describeRecurrence(task.recurrence)}
                        compact
                        icon="repeat-outline"
                        color={theme.swatches[5]}
                      />
                    ) : null}
                    {task.priority !== 'none' ? (
                      <Chip
                        label={PRIORITY_LABEL[task.priority]}
                        compact
                        icon="flag-outline"
                        color={priorityColor}
                      />
                    ) : null}
                    {progress.total > 0 ? (
                      <Chip
                        label={`${progress.done}/${progress.total}`}
                        compact
                        icon="git-branch-outline"
                        color={theme.colors.textSecondary}
                      />
                    ) : null}
                  </View>
                )}
              </View>

              <Confetti ref={confettiRef} />
            </View>

            {progress.total > 0 ? (
              <View
                style={{
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: theme.colors.surfaceSunken,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.round(progress.ratio * 100)}%`,
                    height: '100%',
                    backgroundColor: theme.colors.success,
                  }}
                />
              </View>
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
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
});
