import { Ionicons } from '@expo/vector-icons';
import { addDays, format, startOfDay, startOfWeek, subDays } from 'date-fns';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { computeStreak, longestStreak } from '@/db/repositories/habits';
import { formatHours } from '@/domain/format';
import { usePreferences } from '@/store/usePreferences';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { toDateKey } from '@/utils/id';

import { Card, Chip, Text } from './ui';

/** Tasks that must be finished before the peak-hours panel says anything. */
const PEAK_HOURS_UNLOCK = 3;

/** Fake but plausible shape for the faded "this is what you get" charts. */
const SAMPLE_FOCUS = [0.35, 0.6, 0.15, 0.8, 1, 0.25, 0.45, 0.5, 0.3, 0.7, 0.55, 0.2, 0.6, 0.4];
const SAMPLE_HOURS = [
  0, 0, 0, 0, 0, 0, 0.2, 0.5, 0.9, 1, 0.7, 0.5,
  0.35, 0.4, 0.8, 0.9, 0.6, 0.3, 0.15, 0.1, 0, 0, 0, 0,
];

interface AnalyticsPanelProps {
  /** Number of days plotted in the focus chart. */
  windowDays?: number;
}

/**
 * Productivity analytics.
 *
 * Everything here is derived from local data — completion rate, focus minutes
 * per day, the hours where output actually happens, and habit streaks.
 */
export function AnalyticsPanel({ windowDays = 14 }: AnalyticsPanelProps) {
  const theme = useTheme();
  const tasks = useStore((s) => s.tasks);
  const focusSessions = useStore((s) => s.focusSessions);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const projects = useStore((s) => s.projects);
  const weeklyGoalTasks = usePreferences((s) => s.weeklyGoalTasks);
  const setWeeklyGoalTasks = usePreferences((s) => s.setWeeklyGoalTasks);

  const dailyFocus = useMemo(() => {
    const start = subDays(startOfDay(new Date()), windowDays - 1);
    const buckets = new Map<string, number>();
    for (let index = 0; index < windowDays; index += 1) {
      buckets.set(format(addDays(start, index), 'yyyy-MM-dd'), 0);
    }
    for (const session of focusSessions) {
      if (session.kind !== 'focus') continue;
      const key = toDateKey(session.startedAt);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + session.durationSeconds);
      }
    }
    return Array.from(buckets.entries()).map(([dateKey, seconds]) => ({ dateKey, seconds }));
  }, [focusSessions, windowDays]);

  const peakSeconds = Math.max(60, ...dailyFocus.map((day) => day.seconds));

  /** Start of the selected window — everything below is scoped to it. */
  const windowStart = useMemo(
    () => subDays(startOfDay(new Date()), windowDays - 1),
    [windowDays],
  );

  /**
   * Completion rate for the selected window: of everything that came due in
   * these N days, how much got finished. The old tile divided *all-time* done
   * by *all-time* total while sitting under a "7/14/30 days" switch, so the
   * number never matched the range the user had picked.
   */
  const completion = useMemo(() => {
    const windowEnd = new Date();
    const dueInWindow = tasks.filter((task) => {
      if (!task.dueAt) return false;
      const due = new Date(task.dueAt).getTime();
      return due >= windowStart.getTime() && due <= windowEnd.getTime();
    });
    const done = dueInWindow.filter((task) => task.status === 'done').length;
    if (dueInWindow.length > 0) {
      return { done, total: dueInWindow.length, ratio: done / dueInWindow.length, scope: 'window' as const };
    }
    // Nothing fell due in the window — fall back to all-time so the tile is
    // never a misleading 0%.
    const allDone = tasks.filter((task) => task.status === 'done').length;
    const total = tasks.length;
    return { done: allDone, total, ratio: total === 0 ? 0 : allDone / total, scope: 'all' as const };
  }, [tasks, windowStart]);

  const hourly = useMemo(() => {
    const buckets = new Array<number>(24).fill(0);
    for (const task of tasks) {
      if (task.status !== 'done' || !task.completedAt) continue;
      // Same window as the chart above it, so "peak window" means the range
      // the user selected.
      if (new Date(task.completedAt).getTime() < windowStart.getTime()) continue;
      buckets[new Date(task.completedAt).getHours()] += 1;
    }
    return buckets;
  }, [tasks, windowStart]);

  const peakHour = hourly.indexOf(Math.max(...hourly));

  const focusByProject = useMemo(() => {
    const totals = new Map<string | null, number>();
    for (const session of focusSessions) {
      if (session.kind !== 'focus') continue;
      totals.set(session.projectId, (totals.get(session.projectId) ?? 0) + session.durationSeconds);
    }
    return Array.from(totals.entries())
      .map(([projectId, seconds]) => ({
        projectId,
        seconds,
        name: projectId
          ? projects.find((project) => project.id === projectId)?.name ?? 'Deleted project'
          : 'Unassigned',
        color: projectId
          ? projects.find((project) => project.id === projectId)?.color ?? theme.colors.accent
          : theme.colors.textTertiary,
      }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 6);
  }, [focusSessions, projects, theme.colors.accent, theme.colors.textTertiary]);

  const projectFocusMax = Math.max(60, ...focusByProject.map((entry) => entry.seconds));

  const activeHabits = habits.filter((habit) => !habit.isArchived);

  /**
   * Weekly summary: everything that answers "how did this week go?" in one
   * card, rather than making the user add up four other panels.
   */
  const weekly = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const doneTasks = tasks.filter(
      (task) =>
        task.status === 'done' &&
        task.completedAt !== null &&
        new Date(task.completedAt).getTime() >= weekStart.getTime(),
    );
    const focusSeconds = focusSessions
      .filter(
        (session) =>
          session.kind === 'focus' && new Date(session.startedAt).getTime() >= weekStart.getTime(),
      )
      .reduce((total, session) => total + session.durationSeconds, 0);

    const perDay = new Map<string, number>();
    for (const task of doneTasks) {
      const key = toDateKey(task.completedAt!);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    let bestDay: string | null = null;
    let bestCount = 0;
    for (const [key, count] of perDay) {
      if (count > bestCount) {
        bestCount = count;
        bestDay = key;
      }
    }

    const today = new Date();
    const daysLeft = 7 - ((today.getDay() + 6) % 7) - 1;

    return {
      done: doneTasks.length,
      focusSeconds,
      bestDay,
      bestCount,
      daysLeft,
      onTrack: weeklyGoalTasks === 0 ? true : doneTasks.length >= Math.ceil((weeklyGoalTasks * ((today.getDay() + 6) % 7 + 1)) / 7),
    };
  }, [focusSessions, tasks, weeklyGoalTasks]);

  const hasFocusData = dailyFocus.some((day) => day.seconds > 0);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {/* ------------------------------------------------- weekly summary */}
      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Ionicons name="calendar-clear-outline" size={16} color={theme.colors.accent} />
            <Text variant="heading" style={{ flex: 1 }}>
              This week
            </Text>
            <Text variant="micro" color={weekly.onTrack ? theme.colors.success : theme.colors.textTertiary}>
              {weekly.onTrack ? 'ON TRACK' : 'BEHIND'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <WeeklyStat icon="checkmark-done-outline" value={`${weekly.done}`} label="tasks done" />
            <WeeklyStat
              icon="timer-outline"
              value={formatHours(weekly.focusSeconds)}
              label="focus time"
            />
            <WeeklyStat
              icon="trophy-outline"
              value={weekly.bestDay ? format(new Date(`${weekly.bestDay}T12:00:00`), 'EEE') : '—'}
              label={weekly.bestCount > 0 ? `best day · ${weekly.bestCount}` : 'best day'}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
            <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
              {weeklyGoalTasks === 0
                ? 'Set a weekly target of finished tasks to track progress here.'
                : `${weekly.done} of ${weeklyGoalTasks} tasks · ${Math.max(0, weekly.daysLeft)} day${weekly.daysLeft === 1 ? '' : 's'} left in the week.`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[5, 10, 20, 0].map((goal) => (
              <Chip
                key={goal}
                label={goal === 0 ? 'No goal' : `${goal}/week`}
                compact
                selected={weeklyGoalTasks === goal}
                accessibilityLabel={goal === 0 ? 'Remove the weekly goal' : `Weekly goal of ${goal} tasks`}
                onPress={() => setWeeklyGoalTasks(goal)}
              />
            ))}
          </View>
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <MetricTile
          icon="checkmark-done-outline"
          label="Completion"
          value={`${Math.round(completion.ratio * 100)}%`}
          caption={
            completion.scope === 'window'
              ? `${completion.done} of ${completion.total} due in ${windowDays}d`
              : `${completion.done} of ${completion.total} tasks`
          }
          color={theme.colors.success}
        />
        <MetricTile
          icon="timer-outline"
          label="Focus"
          // Through `formatHours`: rounding to whole hours showed "0h" next to
          // a real 25-minute session, which reads as broken data.
          value={formatHours(dailyFocus.reduce((total, day) => total + day.seconds, 0))}
          caption={`last ${windowDays} days`}
          color={theme.colors.accent}
        />
      </View>

      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="heading">Focus time</Text>
            <View style={{ flex: 1 }} />
            <Text variant="caption" color={theme.colors.textTertiary}>
              per day
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 108 }}>
            {(hasFocusData ? dailyFocus : SAMPLE_FOCUS.map((value, index) => ({ dateKey: `sample-${index}`, seconds: value, sample: true }))).map((day, index) => {
              const ratio = 'sample' in day ? (day.seconds as number) : day.seconds / peakSeconds;
              return (
                <View key={day.dateKey} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <GrowingBar
                    height={Math.max(3, ratio * 92)}
                    delay={index * 16}
                    color={day.seconds === 0 ? theme.colors.surfaceSunken : theme.colors.accent}
                    // The sample chart is deliberately washed out, so it can
                    // never be mistaken for real data.
                    opacity={'sample' in day ? 0.18 : day.seconds === 0 ? 1 : 0.35 + ratio * 0.65}
                  />
                  <Text variant="micro" color={theme.colors.textTertiary}>
                    {'sample' in day ? '·' : format(new Date(`${day.dateKey}T12:00:00`), 'EEEEE')}
                  </Text>
                </View>
              );
            })}
          </View>

          {hasFocusData ? null : (
            <Text variant="caption" color={theme.colors.textSecondary}>
              Example — run your first focus block and this becomes your real week.
            </Text>
          )}
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="heading">Most productive hours</Text>
          <Text variant="caption" color={theme.colors.textSecondary}>
            {completion.done < PEAK_HOURS_UNLOCK
              ? `Complete ${PEAK_HOURS_UNLOCK} tasks to unlock your peak hours — the bars below are an example.`
              : `You get the most done around ${formatHour(peakHour)}.`}
          </Text>
          <HourStrip hourly={hourly} unlocked={completion.done >= PEAK_HOURS_UNLOCK} />
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="heading">Focus by project</Text>
          {focusByProject.length === 0 ? (
            <Text variant="caption" color={theme.colors.textSecondary}>
              Run a focus session to attribute time to a project.
            </Text>
          ) : (
            focusByProject.map((entry) => (
              <View key={entry.name} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text variant="caption" color={theme.colors.textSecondary}>
                    {Math.round(entry.seconds / 60)}m
                  </Text>
                </View>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.colors.surfaceSunken,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${Math.round((entry.seconds / projectFocusMax) * 100)}%`,
                      height: '100%',
                      backgroundColor: entry.color,
                    }}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      </Card>

      {activeHabits.length > 0 ? (
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <Text variant="heading">Habit streaks</Text>
            {activeHabits.map((habit) => {
              const logs = habitLogs.filter((log) => log.habitId === habit.id);
              const current = computeStreak(logs);
              const best = longestStreak(logs);
              return (
                <View key={habit.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <View
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: habit.color }}
                  />
                  <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                    {habit.name}
                  </Text>
                  <Text variant="caption" color={theme.colors.textSecondary}>
                    {current}d now · {best}d best
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function MetricTile({
  icon,
  label,
  value,
  caption,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  caption: string;
  color: string;
}) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <View style={{ gap: 6 }}>
        <Ionicons name={icon} size={17} color={color} />
        <Text variant="micro" color={theme.colors.textTertiary}>
          {label.toUpperCase()}
        </Text>
        <Text variant="title">{value}</Text>
        <Text variant="caption" color={theme.colors.textSecondary}>
          {caption}
        </Text>
      </View>
    </Card>
  );
}

function HourStrip({ hourly, unlocked }: { hourly: number[]; unlocked: boolean }) {
  const theme = useTheme();
  const max = Math.max(1, ...hourly);
  return (
    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 48 }}>
      {hourly.map((count, hour) => (
        <GrowingBar
          key={hour}
          flex
          height={
            unlocked ? Math.max(3, (count / max) * 44) : Math.max(3, SAMPLE_HOURS[hour] * 44)
          }
          delay={hour * 12}
          color={
            unlocked && count === 0 ? theme.colors.surfaceSunken : theme.colors.success
          }
          opacity={unlocked ? (count === 0 ? 1 : 0.4 + (count / max) * 0.6) : 0.18}
        />
      ))}
    </View>
  );
}

/** One of the three weekly-summary figures. */
function WeeklyStat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Ionicons name={icon} size={15} color={theme.colors.textTertiary} />
      <Text variant="title">{value}</Text>
      <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Chart bar that grows from the baseline when it mounts, and re-grows whenever
 * the value changes (e.g. when the Insights range flips). Staggered by `delay`
 * so a row of bars sweeps in left to right.
 */
function GrowingBar({
  height,
  color,
  opacity,
  delay = 0,
  flex = false,
}: {
  height: number;
  color: string;
  opacity: number;
  delay?: number;
  flex?: boolean;
}) {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    grow.setValue(0);
    const animation = Animated.timing(grow, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      // Height is a layout prop, so the native driver cannot drive it.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, grow, height]);

  return (
    <Animated.View
      style={{
        ...(flex ? { flex: 1 } : { width: '100%' }),
        height: grow.interpolate({ inputRange: [0, 1], outputRange: [3, height] }),
        borderRadius: 4,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}
