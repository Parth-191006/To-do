import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';

import { cancelScheduled, scheduleFocusEnd } from '@/services/notifications/scheduler';
import { isOpen } from '@/store/selectors';
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

import { ProgressRing } from './ProgressRing';
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
 *  - Pausing keeps your remaining time. The previous implementation reset the
 *    clock to the full duration the moment `running` became false, so "Pause"
 *    behaved like "Restart" and threw away the block.
 *  - Backgrounding no longer freezes the countdown, because remaining time is
 *    derived from a wall-clock deadline rather than a count of interval ticks.
 *  - One focus session row covers the whole block, so pausing does not shatter a
 *    single Pomodoro into several partial sessions in your analytics.
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

  const [mode, setMode] = useState<Mode>('focus');
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [taskId, setTaskId] = useState<string | null>(null);

  const totalMs = (mode === 'focus' ? focusMinutes : breakMinutes) * 60_000;

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

  const openTasks = useMemo(
    () => tasks.filter((task) => task.parentId === null && isOpen(task)).slice(0, 20),
    [tasks],
  );

  const linkedTask = useMemo(() => tasks.find((task) => task.id === taskId) ?? null, [taskId, tasks]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === linkedTask?.projectId) ?? null,
    [linkedTask?.projectId, projects],
  );

  const focusToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return focusSessions
      .filter((session) => session.kind === 'focus' && new Date(session.startedAt) >= start)
      .reduce((total, session) => total + session.durationSeconds, 0);
  }, [focusSessions]);

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

        const nextMode: Mode = mode === 'focus' ? 'break' : 'focus';
        setMode(nextMode);
        setClock(createClock((nextMode === 'focus' ? focusMinutes : breakMinutes) * 60_000));
        setLastOutcome(
          mode === 'focus'
            ? 'Focus block complete — time for a break'
            : 'Break over — ready for another block?',
        );
      } finally {
        finishingRef.current = false;
      }
    },
    [breakMinutes, clock, finishSession, focusMinutes, mode, setLastOutcome],
  );

  const start = useCallback(async () => {
    tapLight();
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
    }

    clearAlert();
    notifyIdRef.current = await scheduleFocusEnd(new Date(next.deadline), taskId, label).catch(
      () => null,
    );
  }, [beginFocus, clearAlert, clock, linkedTask, mode, taskId, totalMs]);

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

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <ProgressRing
          progress={progressOf(clock)}
          size={228}
          strokeWidth={15}
          color={mode === 'focus' ? theme.colors.accent : theme.colors.success}
        >
          <Text variant="micro" color={mode === 'focus' ? theme.colors.accent : theme.colors.success}>
            {clock.phase === 'paused' ? 'PAUSED' : mode === 'focus' ? 'FOCUS' : 'BREAK'}
          </Text>
          <Text style={{ fontSize: 46, fontWeight: '800', color: theme.colors.textPrimary }}>
            {clockLabel(remainingMs)}
          </Text>
          {linkedTask ? (
            <Text
              variant="caption"
              color={theme.colors.textSecondary}
              numberOfLines={1}
              style={{ maxWidth: 150 }}
            >
              {linkedTask.title}
            </Text>
          ) : (
            <Text variant="caption" color={theme.colors.textTertiary}>
              {minutesSpent > 0 ? `${minutesSpent} min in` : 'Pick a task below'}
            </Text>
          )}
        </ProgressRing>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
          <ScalePress
            haptic={false}
            onPress={() => (running ? pause() : void start())}
            style={{ borderRadius: theme.radii.pill, overflow: 'hidden' }}
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
                paddingVertical: 14,
                paddingHorizontal: theme.spacing['2xl'],
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
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 50,
              height: 50,
              borderRadius: 25,
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

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" color={theme.colors.textSecondary}>
          {mode === 'focus' ? 'Focus length' : 'Break length'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(mode === 'focus' ? FOCUS_PRESETS : BREAK_PRESETS).map((preset) => {
            const active = mode === 'focus' ? focusMinutes === preset : breakMinutes === preset;
            return (
              <Chip
                key={preset}
                label={`${preset} min`}
                selected={active}
                onPress={() => {
                  selection();
                  if (mode === 'focus') setFocusMinutes(preset);
                  else setBreakMinutes(preset);
                }}
              />
            );
          })}
        </ScrollView>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" color={theme.colors.textSecondary}>
          Working on
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Nothing" selected={taskId === null} onPress={() => setTaskId(null)} />
          {openTasks.map((task) => (
            <Chip
              key={task.id}
              label={task.title.length > 26 ? `${task.title.slice(0, 24)}…` : task.title}
              selected={taskId === task.id}
              onPress={() => setTaskId(task.id)}
            />
          ))}
        </ScrollView>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.lg,
        }}
      >
        <Ionicons name="flame-outline" size={18} color={theme.colors.warning} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{Math.round(focusToday / 60)} min focused today</Text>
          <Text variant="caption" color={theme.colors.textSecondary}>
            {selectedProject ? `Project · ${selectedProject.name}` : 'Pick a task to attribute your time'}
          </Text>
        </View>
        {linkedTask && linkedTask.status !== 'done' ? (
          <Chip
            label="Complete"
            icon="checkmark"
            selected
            onPress={() => {
              success();
              void toggleTask(linkedTask.id);
            }}
          />
        ) : null}
      </View>

      {sessionId === null && clock.phase === 'idle' && focusToday === 0 ? (
        <Text variant="micro" color={theme.colors.textTertiary}>
          YOUR BLOCK KEEPS RUNNING IN THE BACKGROUND — A NOTIFICATION TELLS YOU WHEN TIME IS UP.
        </Text>
      ) : null}
    </View>
  );
}
