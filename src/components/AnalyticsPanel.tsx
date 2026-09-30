import { Ionicons } from '@expo/vector-icons';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { computeStreak, longestStreak } from '@/db/repositories/habits';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { toDateKey } from '@/utils/id';

import { Card, Text } from './ui';

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

  const completion = useMemo(() => {
    const done = tasks.filter((task) => task.status === 'done').length;
    const total = tasks.length;
    return { done, total, ratio: total === 0 ? 0 : done / total };
  }, [tasks]);

  const hourly = useMemo(() => {
    const buckets = new Array<number>(24).fill(0);
    for (const task of tasks) {
      if (task.status !== 'done' || !task.completedAt) continue;
      buckets[new Date(task.completedAt).getHours()] += 1;
    }
    return buckets;
  }, [tasks]);

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

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <MetricTile
          icon="checkmark-done-outline"
          label="Completion"
          value={`${Math.round(completion.ratio * 100)}%`}
          caption={`${completion.done} of ${completion.total} tasks`}
          color={theme.colors.success}
        />
        <MetricTile
          icon="timer-outline"
          label="Focus"
          value={`${Math.round(dailyFocus.reduce((sum, day) => sum + day.seconds, 0) / 3600)}h`}
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
            {dailyFocus.map((day) => {
              const ratio = day.seconds / peakSeconds;
              return (
                <View key={day.dateKey} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View
                    style={{
                      width: '100%',
                      height: Math.max(3, ratio * 92),
                      borderRadius: 4,
                      backgroundColor:
                        day.seconds === 0 ? theme.colors.surfaceSunken : theme.colors.accent,
                      opacity: day.seconds === 0 ? 1 : 0.35 + ratio * 0.65,
                    }}
                  />
                  <Text variant="micro" color={theme.colors.textTertiary}>
                    {format(new Date(`${day.dateKey}T12:00:00`), 'EEEEE')}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="heading">Most productive hours</Text>
          <Text variant="caption" color={theme.colors.textSecondary}>
            {completion.done === 0
              ? 'Complete a few tasks to see your peak window.'
              : `You get the most done around ${formatHour(peakHour)}.`}
          </Text>
          <HourStrip hourly={hourly} />
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

function HourStrip({ hourly }: { hourly: number[] }) {
  const theme = useTheme();
  const max = Math.max(1, ...hourly);
  return (
    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 48 }}>
      {hourly.map((count, hour) => (
        <View
          key={hour}
          style={{
            flex: 1,
            height: Math.max(3, (count / max) * 44),
            borderRadius: 2,
            backgroundColor: count === 0 ? theme.colors.surfaceSunken : theme.colors.success,
            opacity: count === 0 ? 1 : 0.4 + (count / max) * 0.6,
          }}
        />
      ))}
    </View>
  );
}

function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}
