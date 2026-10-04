import { Ionicons } from '@expo/vector-icons';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { computeStreak } from '@/db/repositories/habits';
import type { Habit, HabitLog } from '@/domain/types';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { success, selection, tapLight, warning } from '@/utils/haptics';
import { toDateKey } from '@/utils/id';

import { Chip, EmptyState, Text } from './ui';

interface HabitTrackerProps {
  onOpenAnalytics?: () => void;
}

/**
 * One-tap starters. An empty habit screen asked the user to invent a habit from
 * nothing; these make the first step a tap instead of a decision.
 */
const STARTERS: { name: string; color: string }[] = [
  { name: 'Drink water', color: '#0EA5E9' },
  { name: 'Read 10 pages', color: '#F59E0B' },
  { name: 'Walk 20 min', color: '#10B981' },
  { name: 'Sleep by 11pm', color: '#A78BFA' },
];

/** Reminder times offered per habit — cover morning, midday and evening. */
const REMINDER_PRESETS: { label: string; hour: number }[] = [
  { label: '7am', hour: 7 },
  { label: '12pm', hour: 12 },
  { label: '6pm', hour: 18 },
  { label: '9pm', hour: 21 },
];

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** Spoken names for the single-letter chips — "S" alone is ambiguous. */
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  const setHabitReminder = useStore((s) => s.setHabitReminder);
  const setHabitWeekdays = useStore((s) => s.setHabitWeekdays);

  const [newHabit, setNewHabit] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Which habit has its options (reminder time, weekly target) expanded. */
  const [optionsFor, setOptionsFor] = useState<string | null>(null);
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
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color={theme.colors.textSecondary}>
            Or start with one of these
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {STARTERS.map((starter) => (
              <Pressable
                key={starter.name}
                onPress={() => {
                  selection();
                  void addHabit(starter.name, starter.color);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Add the habit ${starter.name}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: theme.radii.pill,
                  backgroundColor: theme.colors.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.colors.border,
                }}
              >
                <Ionicons name="add-circle-outline" size={15} color={starter.color} />
                <Text variant="caption" color={theme.colors.textPrimary}>
                  {starter.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <EmptyState
          icon="flame-outline"
          title="No habits yet"
          subtitle="Tap a suggestion above, or type your own — streaks and a 5-week heatmap follow automatically."
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

            {/* Options: a daily nudge time and which days count as target days. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Pressable
                onPress={() => {
                  tapLight();
                  setOptionsFor(optionsFor === habit.id ? null : habit.id);
                }}
                hitSlop={8}
                accessibilityLabel={
                  optionsFor === habit.id ? 'Hide habit options' : 'Show habit options'
                }
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}
              >
                <Ionicons
                  name={habit.reminderHour === null ? 'alarm-outline' : 'alarm'}
                  size={14}
                  color={habit.reminderHour === null ? theme.colors.textTertiary : theme.colors.accent}
                />
                <Text variant="caption" color={theme.colors.textSecondary}>
                  {habit.reminderHour === null
                    ? 'Add reminder'
                    : `Reminder ${formatReminder(habit.reminderHour, habit.reminderMinute)}`}
                </Text>
                <Ionicons
                  name={optionsFor === habit.id ? 'chevron-up' : 'chevron-down'}
                  size={13}
                  color={theme.colors.textTertiary}
                />
              </Pressable>
              <View style={{ flex: 1 }} />
              <Text variant="micro" color={theme.colors.textTertiary}>
                {habit.byWeekday.length === 0
                  ? 'EVERY DAY'
                  : habit.byWeekday.map((day) => WEEKDAY_INITIALS[day]).join(' ')}
              </Text>
            </View>

            {optionsFor === habit.id ? (
              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ gap: 6 }}>
                  <Text variant="micro" color={theme.colors.textTertiary}>
                    REMINDER TIME
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Chip
                      label="Off"
                      compact
                      selected={habit.reminderHour === null}
                      onPress={() => void setHabitReminder(habit.id, null)}
                    />
                    {REMINDER_PRESETS.map((preset) => (
                      <Chip
                        key={preset.label}
                        label={preset.label}
                        compact
                        selected={habit.reminderHour === preset.hour}
                        onPress={() => void setHabitReminder(habit.id, { hour: preset.hour })}
                      />
                    ))}
                  </View>
                </View>

                <View style={{ gap: 6 }}>
                  <Text variant="micro" color={theme.colors.textTertiary}>
                    TARGET DAYS
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    <Chip
                      label="Every day"
                      compact
                      selected={habit.byWeekday.length === 0}
                      onPress={() => void setHabitWeekdays(habit.id, [])}
                    />
                    {WEEKDAY_INITIALS.map((initial, day) => {
                      // Sundays and Thursdays share the letter S / T — the label
                      // alone would be ambiguous, hence the accessibility name.
                      const active = habit.byWeekday.includes(day);
                      return (
                        <Chip
                          key={day}
                          label={initial}
                          compact
                          selected={active}
                          accessibilityLabel={`${WEEKDAY_NAMES[day]} target`}
                          onPress={() => {
                            const next = active
                              ? habit.byWeekday.filter((entry) => entry !== day)
                              : [...habit.byWeekday, day].sort((a, b) => a - b);
                            void setHabitWeekdays(habit.id, next);
                          }}
                        />
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : null}
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

/** Formats a stored reminder time for the habit's option row, e.g. `7:00am`. */
function formatReminder(hour: number, minute: number | null): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${`${minute ?? 0}`.padStart(2, '0')}${suffix}`;
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
