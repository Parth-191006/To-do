import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, View } from 'react-native';

import { cancelScheduled, scheduleFocusEnd } from '@/services/notifications/scheduler';
import { isOpen } from '@/store/selectors';
import { usePreferences } from '@/store/usePreferences';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import {
  clockLabel,
  createClock,
  elapsedMs,
  isExpired,
  pauseClock,
  progressOf,
  startClock,
  tickClock,
} from '@/utils/focusClock';
import { selection, success, tapLight, warning } from '@/utils/haptics';

import { BottomSheet } from './BottomSheet';
import { ProgressRing } from './ProgressRing';
import { TaskPickerSheet } from './TaskPickerSheet';
import { TimeWheels } from './TimeWheels';
import { Chip, ScalePress, Text } from './ui';

const FOCUS_PRESETS = [15, 25, 45, 50];
const BREAK_PRESETS = [5, 10, 15];

/** How often a running block re-reads the wall clock. */
const TICK_MS = 250;

type Mode = 'focus' | 'break';

/**
 * Pomodoro focus timer linked to a task.
 *
 * The clock itself lives in `@/utils/focusClock`, a pure state machine, so the
 * parts that used to misbehave are unit-testable:
 *
 *  - Pausing keeps your remaining time (the old build reset the clock).
 *  - Backgrounding does not freeze the countdown: remaining time is derived
 *    from a wall-clock deadline, not a count of interval ticks.
 *  - One focus session row covers the whole block, so pausing does not shatter
 *    a Pomodoro into several partial sessions in your analytics.
 *
 * Layout note: the ring *is* the timer. It shows the time left and sweeps as
 * the block burns down; dialling an arbitrary length lives behind the "Custom"
 * chip, so the default view answers "how long have I got?" at a glance.
 */
export function FocusTimer() {
  const theme = useTheme();

  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const focusSessions = useStore((s) => s.focusSessions);
  const beginFocus = useStore((s) => s.beginFocus);
  const finishFocus = useStore((s) => s.finishFocus);
  const toggleTask = useStore((s) => s.toggleTask);
  const setLastOutcome = useStore((s) => s.setLastOutcome);

  const autoStartBreak = usePreferences((s) => s.autoStartBreak);
  const dailyGoalMinutes = usePreferences((s) => s.dailyGoalMinutes);
  const longBreakEvery = usePreferences((s) => s.longBreakEvery);
  const longBreakMinutes = usePreferences((s) => s.longBreakMinutes);
  const roundsCompleted = usePreferences((s) => s.roundsCompleted);
  const setRoundsCompleted = usePreferences((s) => s.setRoundsCompleted);

  /** Set when the user taps "Start focus" on a task's notification or lock screen. */
  const params = useLocalSearchParams<{ taskId?: string; autostart?: string }>();

  const [mode, setMode] = useState<Mode>('focus');
  const [focusMs, setFocusMs] = useState(25 * 60_000);
  const [breakMs, setBreakMs] = useState(5 * 60_000);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** The *next* break is long when the round counter is about to wrap. */
  const nextBreakIsLong = useMemo(
    () => longBreakEvery > 0 && (roundsCompleted + 1) % longBreakEvery === 0,
    [longBreakEvery, roundsCompleted],
  );
  const effectiveBreakMs = nextBreakIsLong ? longBreakMinutes * 60_000 : breakMs;

  const ringColor = mode === 'focus' ? theme.colors.accent : theme.colors.success;
  const totalMs = mode === 'focus' ? focusMs : effectiveBreakMs;

  const [clock, setClock] = useState(() => createClock(25 * 60_000));
  const [sessionId, setSessionId] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  /** OS identifier of the pending "block complete" alert. */
  const notifyIdRef = useRef<string | null>(null);
  const finishingRef = useRef(false);
  const finishFocusRef = useRef(finishFocus);
  finishFocusRef.current = finishFocus;

  const running = clock.phase === 'running';
  const remainingMs = clock.remainingMs;

  const linkedTask = useMemo(() => tasks.find((task) => task.id === taskId) ?? null, [taskId, tasks]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === linkedTask?.projectId) ?? null,
    [linkedTask?.projectId, projects],
  );

  const openTaskCount = useMemo(
    () => tasks.filter((task) => task.parentId === null && isOpen(task)).length,
    [tasks],
  );

  const focusToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return focusSessions
      .filter((session) => session.kind === 'focus' && new Date(session.startedAt) >= start)
      .reduce((total, session) => total + session.durationSeconds, 0);
  }, [focusSessions]);

  const goalRatio = dailyGoalMinutes <= 0 ? 0 : Math.min(1, focusToday / 60 / dailyGoalMinutes);

  /** Closes the open focus session with the time actually spent. */
  const finishSession = useCallback(async (completed: boolean, consumedMs: number) => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    setSessionId(null);
    if (!id) return;
    await finishFocusRef.current(id, Math.max(0, Math.round(consumedMs / 1000)), completed).catch(
      () => undefined,
    );
  }, []);

  const clearAlert = useCallback(() => {
    void cancelScheduled(notifyIdRef.current);
    notifyIdRef.current = null;
  }, []);

  /** Schedules the "block is over" alert for a deadline, replacing any pending one. */
  const scheduleAlert = useCallback(
    async (deadline: number, label: string) => {
      clearAlert();
      notifyIdRef.current = await scheduleFocusEnd(new Date(deadline), taskId, label).catch(
        () => null,
      );
    },
    [clearAlert, taskId],
  );

  /**
   * Switching length or mode always starts a brand new block. Guarded by a
   * ref so that merely *pausing* — which changes no duration — never resets the
   * clock. That guard is the fix for the "Pause restarts the timer" bug.
   */
  const lastTotalRef = useRef(totalMs);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  useEffect(() => {
    if (lastTotalRef.current === totalMs) return;
    lastTotalRef.current = totalMs;
    const consumed = elapsedMs(clockRef.current);
    setClock(createClock(totalMs));
    clearAlert();
    if (sessionIdRef.current) {
      // Abandoning a block mid-flight still banks whatever was earned.
      void finishSession(false, consumed);
    }
  }, [clearAlert, finishSession, totalMs]);

  /** Ends the current block (naturally, or via Skip) and flips to the other mode. */
  const completeBlock = useCallback(
    async (reachedZero: boolean) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      try {
        const consumed = reachedZero ? clock.blockMs : elapsedMs(clock);
        notifyIdRef.current = null;

        if (mode === 'focus') {
          await finishSession(reachedZero, consumed);
        }
        if (reachedZero) success();

        // Only a *finished* focus round counts toward the long-break cycle; a
        // skipped block still banks its minutes but does not earn a long break.
        const rounds = reachedZero && mode === 'focus' ? roundsCompleted + 1 : roundsCompleted;
        if (rounds !== roundsCompleted) setRoundsCompleted(rounds);

        const nextMode: Mode = mode === 'focus' ? 'break' : 'focus';
        const longBreak = longBreakEvery > 0 && rounds > 0 && rounds % longBreakEvery === 0;
        const nextMs =
          nextMode === 'focus' ? focusMs : longBreak ? longBreakMinutes * 60_000 : breakMs;

        // This callback owns the mode flip, so it also claims the new
        // duration — otherwise the duration-change effect below would rebuild
        // the clock a moment later and wipe an auto-started break.
        lastTotalRef.current = nextMs;
        const autoStart = reachedZero && mode === 'focus' && autoStartBreak;
        const fresh = createClock(nextMs);
        const nextClock = autoStart ? startClock(fresh, Date.now(), nextMs) : fresh;
        setMode(nextMode);
        setClock(nextClock);
        setLastOutcome(
          mode === 'focus'
            ? longBreak && nextMode === 'break'
              ? `Round ${rounds} done — take a long break`
              : 'Focus block complete — time for a break'
            : 'Break over — ready for another block?',
        );
        if (autoStart && nextClock.deadline !== null) {
          await scheduleAlert(nextClock.deadline, 'Break over — ready for another block?');
        }
      } finally {
        finishingRef.current = false;
      }
    },
    [
      autoStartBreak,
      breakMs,
      clock,
      finishSession,
      focusMs,
      longBreakEvery,
      longBreakMinutes,
      mode,
      roundsCompleted,
      scheduleAlert,
      setLastOutcome,
      setRoundsCompleted,
    ],
  );

  const start = useCallback(async () => {
    tapLight();
    if (totalMs <= 0) {
      // The custom wheels can dial in 00:00:00 — never start a block that is
      // already expired, it would flip the mode the instant it runs.
      warning();
      return;
    }
    const next = startClock(clock, Date.now(), totalMs);
    setClock(next);

    if (!next.deadline) return;
    const label = linkedTask
      ? `Time is up — ${linkedTask.title}`
      : mode === 'focus'
        ? 'Great work. Take a break.'
        : 'Break over — ready for another block?';

    if (mode === 'focus' && !sessionIdRef.current) {
      try {
        const session = await beginFocus(taskId, linkedTask?.projectId ?? null);
        sessionIdRef.current = session.id;
        setSessionId(session.id);
      } catch {
        // A failed bookkeeping write must not stop the user's timer.
        warning();
      }
      if (taskId === null) {
        // Allowed, but say so — silently counting unattributed minutes is how
        // the Insights "Unassigned" bar gets mysteriously large.
        setLastOutcome('No task linked — this block counts as unassigned time');
      }
    }

    await scheduleAlert(next.deadline, label);
  }, [
    beginFocus,
    clock,
    linkedTask,
    mode,
    scheduleAlert,
    setLastOutcome,
    taskId,
    totalMs,
  ]);

  const pause = useCallback(() => {
    setClock((current) => pauseClock(current, Date.now()));
    // The block is no longer going to end on its own, so pull the alert.
    clearAlert();
  }, [clearAlert]);

  /** Skip: bank the partial block and move on to the other mode. */
  const skip = useCallback(() => {
    tapLight();
    clearAlert();
    void completeBlock(false);
  }, [clearAlert, completeBlock]);

  // The ticker only exists while a block is actually running.
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setClock((current) => tickClock(current, Date.now())), TICK_MS);
    return () => clearInterval(interval);
  }, [running]);

  // Coming back to the foreground re-reads the deadline immediately, so a block
  // that elapsed while the app was suspended lands correctly instead of stalling.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      setClock((current) => tickClock(current, Date.now()));
    });
    return () => subscription.remove();
  }, []);

  // Expiry is a state change, not an event, so it is observed rather than fired.
  useEffect(() => {
    if (!isExpired(clock)) return;
    void completeBlock(true);
  }, [clock, completeBlock]);

  // Leaving the screen mid-block should not leave a dangling open session.
  useEffect(() => {
    return () => {
      const id = sessionIdRef.current;
      if (!id) return;
      const consumed = elapsedMs(clockRef.current);
      sessionIdRef.current = null;
      void finishFocusRef.current(id, Math.round(consumed / 1000), false).catch(() => undefined);
    };
  }, []);

  const minutesSpent = Math.floor(elapsedMs(clock) / 60_000);
  const phaseLabel = clock.phase === 'paused' ? 'PAUSED' : mode === 'focus' ? 'FOCUS' : 'BREAK';

  /**
   * Quick action from a notification, the lock screen or a deep link:
   * `/focus?taskId=…&autostart=1` links the task and starts the block without
   * another tap — which is the whole point of the action.
   */
  const handledQuickStartRef = useRef(false);
  useEffect(() => {
    if (handledQuickStartRef.current) return;
    const requested = typeof params.taskId === 'string' ? params.taskId : null;
    if (!requested) return;
    handledQuickStartRef.current = true;
    setTaskId(requested);
    if (params.autostart === '1' && clock.phase === 'idle') {
      // Delay one frame so the linked task is in state before the block starts
      // (the alert text and session row both read it).
      const timer = setTimeout(() => void start(), 120);
      return () => clearTimeout(timer);
    }
  }, [clock.phase, params.autostart, params.taskId, start]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {/* ------------------------------------------------------------ ring */}
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <ProgressRing progress={progressOf(clock)} size={264} strokeWidth={18} color={ringColor}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text variant="micro" color={ringColor}>
              {phaseLabel}
            </Text>
            <Text
              style={{
                fontSize: 54,
                fontWeight: '800',
                color: theme.colors.textPrimary,
                letterSpacing: -1.5,
                fontVariant: ['tabular-nums'],
              }}
            >
              {clockLabel(remainingMs)}
            </Text>
            <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={1} style={{ maxWidth: 176 }}>
              {linkedTask ? linkedTask.title : minutesSpent > 0 ? `${minutesSpent} min in` : 'Nothing selected'}
            </Text>
            {clock.phase === 'idle' ? (
              <Text variant="micro" color={theme.colors.textTertiary}>
                {mode === 'focus'
                  ? `ROUND ${roundsCompleted + 1}`
                  : nextBreakIsLong
                    ? 'LONG BREAK'
                    : 'SHORT BREAK'}
              </Text>
            ) : null}
          </View>
        </ProgressRing>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
          <ScalePress
            haptic={false}
            disabled={totalMs <= 0}
            onPress={() => (running ? pause() : void start())}
            accessibilityLabel={running ? 'Pause the block' : 'Start the block'}
            style={{
              borderRadius: theme.radii.pill,
              overflow: 'hidden',
              opacity: totalMs <= 0 ? 0.45 : 1,
            }}
          >
            <LinearGradient
              colors={
                mode === 'focus'
                  ? theme.colors.accentGradient
                  : ([theme.colors.success, theme.colors.success] as [string, string])
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingVertical: 15,
                paddingHorizontal: theme.spacing['2xl'],
                minHeight: 52,
              }}
            >
              <Ionicons
                name={running ? 'pause' : 'play'}
                size={18}
                color={theme.colors.accentContrast}
              />
              <Text variant="bodyStrong" color={theme.colors.accentContrast}>
                {running ? 'Pause' : clock.phase === 'paused' ? 'Resume' : 'Start'}
              </Text>
            </LinearGradient>
          </ScalePress>

          <ScalePress
            haptic={false}
            onPress={skip}
            accessibilityLabel="Skip to the next block"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: theme.colors.surfaceSunken,
            }}
          >
            <Ionicons name="play-skip-forward" size={19} color={theme.colors.textSecondary} />
          </ScalePress>
        </View>

        {clock.phase === 'paused' ? (
          <Text variant="micro" color={theme.colors.textTertiary}>
            PAUSED — YOUR REMAINING TIME IS KEPT
          </Text>
        ) : null}
      </View>

      {/* -------------------------------------------------- working on task */}
      <Pressable
        onPress={() => {
          tapLight();
          setPickerOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={
          linkedTask ? `Working on ${linkedTask.title}. Change task` : 'Choose a task to work on'
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: linkedTask ? theme.colors.accent : theme.colors.border,
          padding: theme.spacing.lg,
          minHeight: 64,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentSoft,
          }}
        >
          <Ionicons name="briefcase-outline" size={18} color={theme.colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="micro" color={theme.colors.textTertiary}>
            WORKING ON
          </Text>
          <Text variant="bodyStrong" numberOfLines={1}>
            {linkedTask ? linkedTask.title : 'Choose a task'}
          </Text>
          <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
            {selectedProject
              ? `Will log to ${selectedProject.name}`
              : openTaskCount > 0
                ? `${openTaskCount} open task${openTaskCount === 1 ? '' : 's'} to pick from`
                : 'No open tasks yet — time will be unassigned'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Pressable>

      {/* --------------------------------------------------- lengths + cycle */}
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" color={theme.colors.textSecondary}>
          {mode === 'focus' ? 'Focus length' : nextBreakIsLong ? 'Long break length' : 'Break length'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(mode === 'focus' ? FOCUS_PRESETS : BREAK_PRESETS).map((preset) => {
            const active = mode === 'focus'
              ? totalMs === preset * 60_000
              : !nextBreakIsLong && totalMs === preset * 60_000;
            return (
              <Chip
                key={preset}
                label={`${preset} min`}
                selected={active}
                accessibilityLabel={`Set length to ${preset} minutes`}
                onPress={() => {
                  selection();
                  if (mode === 'focus') setFocusMs(preset * 60_000);
                  else setBreakMs(preset * 60_000);
                }}
              />
            );
          })}
          <Chip
            label="Custom"
            icon="options-outline"
            selected={!(mode === 'focus' ? FOCUS_PRESETS : BREAK_PRESETS).some((preset) =>
              mode === 'focus' ? totalMs === preset * 60_000 : !nextBreakIsLong && totalMs === preset * 60_000,
            )}
            accessibilityLabel="Set a custom length"
            onPress={() => {
              selection();
              setCustomOpen(true);
            }}
          />
        </ScrollView>
      </View>

      {/* ------------------------------------------------ session + goal bar */}
      <View
        style={{
          gap: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Ionicons name="flame-outline" size={17} color={theme.colors.warning} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {Math.round(focusToday / 60)} / {dailyGoalMinutes} min focused today
          </Text>
          <Text variant="micro" color={theme.colors.textTertiary}>
            {roundsCompleted} ROUND{roundsCompleted === 1 ? '' : 'S'}
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
              width: `${Math.round(goalRatio * 100)}%`,
              height: '100%',
              borderRadius: 3,
              backgroundColor: theme.colors.accent,
            }}
          />
        </View>
        <Text variant="caption" color={theme.colors.textSecondary}>
          {goalRatio >= 1
            ? 'Daily goal reached — anything more is a bonus.'
            : `${Math.max(0, dailyGoalMinutes - Math.round(focusToday / 60))} min to go. ` +
              (nextBreakIsLong
                ? `Round ${roundsCompleted + 1} earns a ${longBreakMinutes} min long break.`
                : `Every ${longBreakEvery} rounds earns a ${longBreakMinutes} min long break.`)}
        </Text>

        {linkedTask && linkedTask.status !== 'done' ? (
          <View style={{ flexDirection: 'row' }}>
            <Chip
              label="Complete task"
              icon="checkmark"
              selected
              accessibilityLabel={`Mark ${linkedTask.title} complete`}
              onPress={() => {
                success();
                void toggleTask(linkedTask.id);
              }}
            />
          </View>
        ) : null}
      </View>

      <Text variant="caption" color={theme.colors.textSecondary}>
        Your block keeps running in the background — lock the screen or leave the app and a
        notification tells you when the time is up.
      </Text>

      <TaskPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        tasks={tasks}
        projects={projects}
        selectedId={taskId}
        onSelect={setTaskId}
      />

      <CustomLengthSheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        mode={mode}
        onModeChange={setMode}
        valueMs={mode === 'focus' ? focusMs : breakMs}
        onChange={(ms) => {
          if (mode === 'focus') setFocusMs(ms);
          else setBreakMs(ms);
        }}
        longBreakMinutes={longBreakMinutes}
        longBreakEvery={longBreakEvery}
        onLongBreakMinutes={(minutes) => usePreferences.getState().setLongBreakMinutes(minutes)}
        onLongBreakEvery={(rounds) => usePreferences.getState().setLongBreakEvery(rounds)}
        dailyGoalMinutes={dailyGoalMinutes}
        onDailyGoal={(minutes) => usePreferences.getState().setDailyGoalMinutes(minutes)}
      />
    </View>
  );
}

/**
 * Custom length sheet — the wheel picker from the old design, now opt-in.
 *
 * It also hosts the cycle settings (how many rounds earn a long break, how long
 * that break is, and the daily focus goal) because they are the same kind of
 * "set it once" decision as a custom duration.
 */
function CustomLengthSheet({
  visible,
  onClose,
  mode,
  onModeChange,
  valueMs,
  onChange,
  longBreakMinutes,
  longBreakEvery,
  onLongBreakMinutes,
  onLongBreakEvery,
  dailyGoalMinutes,
  onDailyGoal,
}: {
  visible: boolean;
  onClose: () => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  valueMs: number;
  onChange: (ms: number) => void;
  longBreakMinutes: number;
  longBreakEvery: number;
  onLongBreakMinutes: (minutes: number) => void;
  onLongBreakEvery: (rounds: number) => void;
  dailyGoalMinutes: number;
  onDailyGoal: (minutes: number) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = React.useState(valueMs);

  // Re-seat the wheels each time the sheet opens, so it never shows the value
  // that was dialled in a previous session.
  React.useEffect(() => {
    if (visible) setDraft(valueMs);
  }, [valueMs, visible]);

  const dirty = draft !== valueMs;
  const draftLabel = clockLabel(draft);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Custom length"
      subtitle="Slide hours, minutes and seconds — the way the system clock app does."
      heightRatio={0.86}
    >
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Chip
            label="Focus"
            selected={mode === 'focus'}
            accessibilityLabel="Edit the focus length"
            onPress={() => onModeChange('focus')}
          />
          <Chip
            label="Break"
            selected={mode === 'break'}
            accessibilityLabel="Edit the break length"
            onPress={() => onModeChange('break')}
          />
        </View>

        <View
          style={{
            alignItems: 'center',
            paddingVertical: theme.spacing.md,
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radii.xl,
          }}
        >
          <TimeWheels valueMs={draft} onValueChange={setDraft} />
          <Text variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 6 }}>
            {draftLabel} {mode === 'focus' ? 'of focus' : 'of break'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Chip
            label={dirty ? `Save ${draftLabel}` : 'Saved'}
            icon="checkmark"
            selected
            accessibilityLabel="Save the custom length"
            onPress={() => {
              if (draft <= 0) {
                warning();
                return;
              }
              selection();
              onChange(draft);
              onClose();
            }}
          />
          <Chip label="Cancel" accessibilityLabel="Cancel" onPress={onClose} />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color={theme.colors.textSecondary}>
            Long break cycle
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[3, 4, 5].map((rounds) => (
              <Chip
                key={rounds}
                label={`Every ${rounds}`}
                compact
                selected={longBreakEvery === rounds}
                accessibilityLabel={`Long break every ${rounds} rounds`}
                onPress={() => {
                  selection();
                  onLongBreakEvery(rounds);
                }}
              />
            ))}
            <Chip
              label="Off"
              compact
              selected={longBreakEvery === 0}
              accessibilityLabel="Turn the long break cycle off"
              onPress={() => onLongBreakEvery(0)}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[10, 15, 20, 30].map((minutes) => (
              <Chip
                key={minutes}
                label={`${minutes} min`}
                compact
                selected={longBreakMinutes === minutes}
                accessibilityLabel={`Long break of ${minutes} minutes`}
                onPress={() => {
                  selection();
                  onLongBreakMinutes(minutes);
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" color={theme.colors.textSecondary}>
            Daily focus goal
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[30, 60, 90, 120].map((minutes) => (
              <Chip
                key={minutes}
                label={`${minutes}m`}
                compact
                selected={dailyGoalMinutes === minutes}
                accessibilityLabel={`Daily goal of ${minutes} minutes`}
                onPress={() => {
                  selection();
                  onDailyGoal(minutes);
                }}
              />
            ))}
          </View>
        </View>

        <Text variant="caption" color={theme.colors.textSecondary}>
          A block that reaches zero earns a long break every {longBreakEvery || '—'} rounds. Skipping
          still banks the minutes you actually focused.
        </Text>
      </View>
    </BottomSheet>
  );
}
