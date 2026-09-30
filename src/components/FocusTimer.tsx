import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { scheduleFocusEnd } from '@/services/notifications/scheduler';
import { isOpen } from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { selection, success, tapLight } from '@/utils/haptics';

import { ProgressRing } from './ProgressRing';
import { Chip, ScalePress, Text } from './ui';

const FOCUS_PRESETS = [15, 25, 45, 50];
const BREAK_PRESETS = [5, 10, 15];

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`;
}

/**
 * Pomodoro focus timer linked to a task.
 *
 * Sessions are persisted through the store, so total focus time per project
 * feeds the analytics panel and the per-task session count. The end-of-block
 * notification is scheduled with the OS, which means the timer stays accurate
 * even if the app is backgrounded or killed.
 */
export function FocusTimer() {
  const theme = useTheme();

  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const focusSessions = useStore((s) => s.focusSessions);
  const beginFocus = useStore((s) => s.beginFocus);
  const finishFocus = useStore((s) => s.finishFocus);
  const toggleTask = useStore((s) => s.toggleTask);

  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const elapsedRef = useRef(0);

  const totalSeconds = (mode === 'focus' ? focusMinutes : breakMinutes) * 60;

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

  /** Restarts the clock whenever the configured duration or mode changes. */
  useEffect(() => {
    if (running) return;
    setSecondsLeft(totalSeconds);
    elapsedRef.current = 0;
  }, [running, totalSeconds]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setSecondsLeft((current) => {
        elapsedRef.current += 1;
        return current <= 1 ? 0 : current - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  const start = useCallback(async () => {
    tapLight();
    if (mode === 'focus') {
      const session = await beginFocus(taskId, linkedTask?.projectId ?? null);
      setSessionId(session.id);
      await scheduleFocusEnd(
        new Date(Date.now() + totalSeconds * 1000),
        taskId,
        linkedTask ? `Time is up — ${linkedTask.title}` : 'Great work. Take a break.',
      ).catch(() => undefined);
    }
    setRunning(true);
  }, [beginFocus, linkedTask, mode, taskId, totalSeconds]);

  const stop = useCallback(
    async (completed: boolean) => {
      setRunning(false);
      if (mode === 'focus' && sessionId) {
        await finishFocus(sessionId, elapsedRef.current, completed);
        setSessionId(null);
      }
    },
    [finishFocus, mode, sessionId],
  );

  // Reaching zero ends the block and hands the user straight to the break.
  useEffect(() => {
    if (secondsLeft !== 0 || !running) return;
    success();
    void stop(true).then(() => {
      setMode((current) => (current === 'focus' ? 'break' : 'focus'));
    });
  }, [running, secondsLeft, stop]);

  const progress = totalSeconds === 0 ? 0 : 1 - secondsLeft / totalSeconds;
  const ringColor = mode === 'focus' ? theme.colors.accent : theme.colors.success;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <ProgressRing progress={progress} size={216} strokeWidth={14} color={ringColor}>
          <Text variant="micro" color={theme.colors.textTertiary}>
            {mode === 'focus' ? 'FOCUS' : 'BREAK'}
          </Text>
          <Text style={{ fontSize: 44, fontWeight: '800', color: theme.colors.textPrimary }}>
            {formatClock(secondsLeft)}
          </Text>
          {linkedTask ? (
            <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={1} style={{ maxWidth: 140 }}>
              {linkedTask.title}
            </Text>
          ) : null}
        </ProgressRing>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <ScalePress
            haptic={false}
            onPress={() => (running ? void stop(false) : void start())}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              backgroundColor: ringColor,
              borderRadius: theme.radii.pill,
              paddingVertical: 13,
              paddingHorizontal: theme.spacing['2xl'],
            }}
          >
            <Ionicons
              name={running ? 'pause' : 'play'}
              size={18}
              color={theme.colors.accentContrast}
            />
            <Text variant="bodyStrong" color={theme.colors.accentContrast}>
              {running ? 'Pause' : 'Start'}
            </Text>
          </ScalePress>

          <ScalePress
            haptic={false}
            onPress={() => {
              void stop(false).then(() => {
                setMode((current) => (current === 'focus' ? 'break' : 'focus'));
              });
            }}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: theme.colors.surfaceSunken,
            }}
          >
            <Ionicons name="swap-horizontal" size={20} color={theme.colors.textSecondary} />
          </ScalePress>
        </View>
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
                  setSecondsLeft(preset * 60);
                  elapsedRef.current = 0;
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
          borderWidth: StyleSheet.hairlineWidth,
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
    </View>
  );
}
