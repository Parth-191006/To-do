import { Ionicons } from '@expo/vector-icons';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { computeStreak } from '@/db/repositories/habits';
import type { Habit, HabitLog } from '@/domain/types';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { success, tapLight, warning } from '@/utils/haptics';
import { toDateKey } from '@/utils/id';

import { EmptyState, Text } from './ui';

interface HabitTrackerProps {
  onOpenAnalytics?: () => void;
}

/**
 * Habit tracker with streak counters and a contribution-style heatmap.
 *
 * `count` per day lets a habit support multiple check-ins (e.g. drink water
 * ×8), and the heatmap shades by intensity rather than a binary flag.
 */
export function HabitTracker({ onOpenAnalytics }: HabitTrackerProps) {
  const theme = useTheme();
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const toggleHabitToday = useStore((s) => s.toggleHabitToday);
  const addHabit = useStore((s) => s.addHabit);
  const archiveHabit = useStore((s) => s.archiveHabit);

  const [newHabit, setNewHabit] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const today = toDateKey();

  const logsByHabit = useMemo(() => {
    const map = new Map<string, HabitLog[]>();
    for (const log of habitLogs) {
      const list = map.get(log.habitId) ?? [];
      list.push(log);
      map.set(log.habitId, list);
    }
    return map;
  }, [habitLogs]);

  const activeHabits = habits.filter((habit) => !habit.isArchived);

  const handleToggle = useCallback(
    (habit: Habit) => {
      success();
      void toggleHabitToday(habit.id);
    },
    [toggleHabitToday],
  );

  /** Two-tap confirm, matching the list-delete pattern elsewhere in the app. */
  const handleArchive = useCallback(
    (habit: Habit) => {
      if (confirmDeleteId !== habit.id) {
        setConfirmDeleteId(habit.id);
        setTimeout(() => setConfirmDeleteId((current) => (current === habit.id ? null : current)), 3200);
        return;
      }
      setConfirmDeleteId(null);
      warning();
      void archiveHabit(habit.id);
    },
    [archiveHabit, confirmDeleteId],
  );

  if (activeHabits.length === 0) {
    return (
      <View style={{ gap: theme.spacing.lg }}>
        <HabitComposer value={newHabit} onChange={setNewHabit} onSubmit={addHabit} />
        <EmptyState
          icon="flame-outline"
          title="No habits yet"
          subtitle="Add a daily habit to start building streaks — the heatmap is waiting."
        />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <HabitComposer value={newHabit} onChange={setNewHabit} onSubmit={addHabit} />

      {activeHabits.map((habit) => {
        const logs = logsByHabit.get(habit.id) ?? [];
        const streak = computeStreak(logs, today);
        const todayLog = logs.find((log) => log.dateKey === today);
        const doneToday = (todayLog?.count ?? 0) > 0;

        return (
          <View
            key={habit.id}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.xl,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.border,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: doneToday ? habit.color : theme.colors.surfaceSunken,
                }}
              >
                <Ionicons
                  name={doneToday ? 'checkmark' : 'flame-outline'}
                  size={20}
                  color={doneToday ? '#FFFFFF' : habit.color}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{habit.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="flame" size={12} color={theme.colors.warning} />
                  <Text variant="caption" color={theme.colors.textSecondary}>
                    {streak} day{streak === 1 ? '' : 's'} streak
                  </Text>
                </View>
                {confirmDeleteId === habit.id ? (
                  <Text variant="micro" color={theme.colors.danger}>
                    TAP THE TRASH ICON AGAIN TO REMOVE
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => handleArchive(habit)}
                hitSlop={8}
                accessibilityLabel={
                  confirmDeleteId === habit.id ? 'Confirm remove habit' : 'Remove habit'
                }
              >
                <Ionicons
                  name={confirmDeleteId === habit.id ? 'trash' : 'trash-outline'}
                  size={18}
                  color={confirmDeleteId === habit.id ? theme.colors.danger : theme.colors.textTertiary}
                />
              </Pressable>

              <Pressable
                onPress={() => handleToggle(habit)}
                hitSlop={8}
                accessibilityLabel={doneToday ? 'Undo today' : 'Complete today'}
              >
                <Ionicons
                  name={doneToday ? 'checkmark-circle' : 'ellipse-outline'}
                  size={28}
                  color={doneToday ? theme.colors.success : theme.colors.borderStrong}
                />
              </Pressable>
            </View>

            <Heatmap logs={logs} color={habit.color} days={35} />
          </View>
        );
      })}

      {onOpenAnalytics ? (
        <Pressable
          onPress={() => {
            tapLight();
            onOpenAnalytics();
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
            paddingVertical: theme.spacing.md,
          }}
        >
          <Text variant="label" color={theme.colors.accent}>
            View habit analytics
          </Text>
          <Ionicons name="arrow-forward" size={14} color={theme.colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

function HabitComposer({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: 4,
      }}
    >
      <Ionicons name="add-circle-outline" size={18} color={theme.colors.accent} />
      <HabitInput value={value} onChange={onChange} onSubmit={onSubmit} />
    </View>
  );
}

function HabitInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="New habit name"
      placeholderTextColor={theme.colors.textTertiary}
      returnKeyType="done"
      onSubmitEditing={() => {
        const trimmed = value.trim();
        if (!trimmed) return;
        void onSubmit(trimmed);
        onChange('');
      }}
      style={[theme.typography.body, { flex: 1, color: theme.colors.textPrimary, paddingVertical: 12 }]}
    />
  );
}

/** GitHub-style contribution grid, shaded by check-in intensity. */
function Heatmap({ logs, color, days }: { logs: HabitLog[]; color: string; days: number }) {
  const theme = useTheme();
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of logs) map.set(log.dateKey, log.count);
    return map;
  }, [logs]);

  const cells = useMemo(() => {
    const end = startOfDay(new Date());
    const start = subDays(end, days - 1);
    return Array.from({ length: days }, (_, index) => {
      const date = addDays(start, index);
      return { key: format(date, 'yyyy-MM-dd'), date };
    });
  }, [days]);

  const max = Math.max(1, ...Array.from(counts.values()));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 7 * 22, gap: 4 }}>
        {cells.map((cell) => {
          const count = counts.get(cell.key) ?? 0;
          const intensity = count === 0 ? 0 : Math.min(1, count / max);
          return (
            <View
              key={cell.key}
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                backgroundColor:
                  count === 0
                    ? theme.colors.surfaceSunken
                    : withAlpha(color, 0.28 + intensity * 0.72),
              }}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

/** Applies alpha to a #RRGGBB colour so heatmap shading tracks the habit colour. */
function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}
