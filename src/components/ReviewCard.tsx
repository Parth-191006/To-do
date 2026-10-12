import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { isDueToday, isOpen, isOverdue } from '@/store/selectors';
import { usePreferences } from '@/store/usePreferences';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { selection, success, tapLight } from '@/utils/haptics';
import { toDateKey } from '@/utils/id';

import { Chip, Text } from './ui';

/**
 * Morning plan and evening wrap-up.
 *
 * One card, two voices, shown once per half-day:
 *
 *  - **Morning** (before noon) — how the day is shaped and the single next
 *    action, so opening the app answers "what am I doing today?".
 *  - **Evening** (from 6pm) — what got done, what did not, and a one-tap way to
 *    push the leftovers to tomorrow instead of leaving them as a wall of
 *    overdue red.
 *
 * Dismissals are per half-day (`YYYY-MM-DD:morning`), so saying "not now" in the
 * morning does not hide the evening wrap-up.
 */

type Kind = 'morning' | 'evening';

function kindForHour(hour: number): Kind | null {
  if (hour < 12) return 'morning';
  if (hour >= 18) return 'evening';
  return null;
}

export function ReviewCard() {
  const theme = useTheme();
  const tasks = useStore((s) => s.tasks);
  const patchTask = useStore((s) => s.patchTask);
  const lastDismissed = usePreferences((s) => s.lastReviewDismissed);
  const setLastDismissed = usePreferences((s) => s.setLastReviewDismissed);
  const weeklyGoalTasks = usePreferences((s) => s.weeklyGoalTasks);

  const now = new Date();
  const kind = kindForHour(now.getHours());
  const dismissalKey = `${toDateKey(now)}:${kind ?? 'none'}`;

  const stats = useMemo(() => {
    const open = tasks.filter(isOpen);
    const dueToday = open.filter((task) => isDueToday(task, now) && !isOverdue(task, now));
    const overdue = open.filter((task) => isOverdue(task, now));
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const doneToday = tasks.filter(
      (task) =>
        task.status === 'done' &&
        task.completedAt !== null &&
        new Date(task.completedAt).getTime() >= dayStart.getTime(),
    );
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const doneThisWeek = tasks.filter(
      (task) =>
        task.status === 'done' &&
        task.completedAt !== null &&
        new Date(task.completedAt).getTime() >= weekStart.getTime(),
    ).length;
    return { dueToday, overdue, doneToday, doneThisWeek, open };
    // Re-derives whenever the task list changes, so the numbers stay live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  /** Pushes everything due today or overdue to tomorrow morning. */
  const rollOver = useCallback(async () => {
    const targets = [...stats.dueToday, ...stats.overdue];
    if (targets.length === 0) {
      tapLight();
      return;
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const remind = new Date(tomorrow.getTime() - 15 * 60_000);
    for (const task of targets) {
      await patchTask(task.id, { dueAt: tomorrow.toISOString(), remindAt: remind.toISOString() });
    }
    success();
    setLastDismissed(dismissalKey);
  }, [dismissalKey, patchTask, setLastDismissed, stats.dueToday, stats.overdue]);

  if (!kind || lastDismissed === dismissalKey) return null;

  const nextUp = stats.overdue[0] ?? stats.dueToday[0] ?? null;
  const nothingPending =
    stats.open.length === 0 && stats.doneToday.length === 0 && stats.overdue.length === 0;

  /**
   * A day with nothing in it gets no card. The card used to greet an empty
   * list with "Nothing is waiting — add the first thing you want to finish",
   * directly above the capture field and the empty state saying the same
   * thing in different words. Three voices, one message.
   */
  if (nothingPending) return null;

  // One short line each. The card used to open with a sentence and a tally of
  // up to four clauses, which is a status report in a place that only needs to
  // say what the day looks like.
  const title =
    kind === 'morning'
      ? stats.open.length === 0
        ? 'Nothing queued'
        : `${stats.open.length} open today`
      : stats.doneToday.length === 0
        ? 'Wrap up your day'
        : `${stats.doneToday.length} done today`;

  const body =
    kind === 'morning'
      ? [
          stats.overdue.length > 0 ? `${stats.overdue.length} overdue` : null,
          stats.dueToday.length > 0 ? `${stats.dueToday.length} due today` : null,
          nextUp ? `next: “${nextUp.title}”` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : [
          `${stats.open.length} still open`,
          weeklyGoalTasks > 0
            ? `${stats.doneThisWeek} of ${weeklyGoalTasks} this week`
            : `${stats.doneThisWeek} done this week`,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <View
      style={{
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.accentSoft,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons
          name={kind === 'morning' ? 'sunny-outline' : 'moon-outline'}
          size={16}
          color={theme.colors.accent}
        />
        <Text variant="bodyStrong" color={theme.colors.accent} style={{ flex: 1 }}>
          {title}
        </Text>
      </View>

      <Text variant="caption" color={theme.colors.textSecondary}>
        {body}
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        {kind === 'evening' && stats.dueToday.length + stats.overdue.length > 0 ? (
          <Chip
            label="Push to tomorrow"
            icon="arrow-forward-circle-outline"
            selected
            accessibilityLabel="Move everything due today or overdue to tomorrow morning"
            onPress={() => void rollOver()}
          />
        ) : null}
        <Chip
          label={kind === 'morning' ? 'Got it' : 'Done'}
          accessibilityLabel="Dismiss this review card"
          onPress={() => {
            selection();
            setLastDismissed(dismissalKey);
          }}
        />
      </View>
    </View>
  );
}
