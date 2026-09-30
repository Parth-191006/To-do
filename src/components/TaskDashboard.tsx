import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { TaskStatus, TaskWithTags } from '@/domain/types';
import { applyFilters, isDueToday, isOpen, isOverdue, sortByUrgency, summarizeDay, topLevel } from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { tapHeavy, tapLight } from '@/utils/haptics';

import { ProgressRing } from './ProgressRing';
import { SmartInput } from './SmartInput';
import { TaskCard } from './TaskCard';
import { ViewSwitcher } from './ViewSwitcher';
import { EmptyState, ScalePress, Text } from './ui';
import { CalendarAgenda } from './views/CalendarAgenda';
import { EisenhowerMatrix } from './views/EisenhowerMatrix';
import { KanbanBoard } from './views/KanbanBoard';

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TaskDashboard() {
  const theme = useTheme();
  const router = useRouter();

  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const focusSessions = useStore((s) => s.focusSessions);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const search = useStore((s) => s.search);
  const addTaskFromInput = useStore((s) => s.addTaskFromInput);
  const toggleTask = useStore((s) => s.toggleTask);
  const removeTask = useStore((s) => s.removeTask);
  const patchTask = useStore((s) => s.patchTask);
  const breakDownTask = useStore((s) => s.breakDownTask);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const focusSecondsToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return focusSessions
      .filter((session) => session.kind === 'focus' && new Date(session.startedAt) >= start)
      .reduce((total, session) => total + session.durationSeconds, 0);
  }, [focusSessions]);

  const summary = useMemo(
    () => summarizeDay(tasks, focusSecondsToday),
    [focusSecondsToday, tasks],
  );

  const visibleTasks = useMemo(() => {
    return sortByUrgency(applyFilters(tasks, { projectId: activeProjectId, tagId: null, search }));
  }, [activeProjectId, search, tasks]);

  const todayTasks = useMemo(
    () =>
      sortByUrgency(
        topLevel(tasks).filter((task) => isDueToday(task) || isOverdue(task)),
      ),
    [tasks],
  );

  const handleOpen = useCallback(
    (id: string) => {
      router.push(`/task/${id}`);
    },
    [router],
  );

  const handleBreakDown = useCallback(
    async (id: string) => {
      tapHeavy();
      setBanner('Generating subtasks…');
      const count = await breakDownTask(id);
      setBanner(count > 0 ? `Added ${count} subtasks` : 'Could not break this task down');
      setTimeout(() => setBanner(null), 2400);
    },
    [breakDownTask],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void removeTask(id);
      setBanner('Task deleted');
      setTimeout(() => setBanner(null), 1800);
    },
    [removeTask],
  );

  const handleMove = useCallback(
    (id: string, status: TaskStatus) => {
      void patchTask(id, { status });
    },
    [patchTask],
  );

  const listTasks = view === 'list' ? visibleTasks.filter((task) => task.parentId === null) : [];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140, gap: theme.spacing.lg }}
        stickyHeaderIndices={[]}
      >
        {/* Header */}
        <View style={{ gap: 2 }}>
          <Text variant="caption" color={theme.colors.textSecondary}>
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          <Text variant="display">{greeting()}</Text>
        </View>

        {/* Day summary */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.lg,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii['2xl'],
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.border,
            padding: theme.spacing.lg,
          }}
        >
          <ProgressRing progress={summary.completionRatio} size={84} strokeWidth={9}>
            <Text variant="title">{Math.round(summary.completionRatio * 100)}%</Text>
            <Text variant="micro" color={theme.colors.textTertiary}>
              DONE
            </Text>
          </ProgressRing>

          <View style={{ flex: 1, gap: theme.spacing.sm }}>
            <StatRow label="Open today" value={`${summary.openTasks}`} icon="today-outline" />
            <StatRow
              label="Overdue"
              value={`${summary.overdue}`}
              icon="alert-circle-outline"
              color={summary.overdue > 0 ? theme.colors.danger : undefined}
            />
            <StatRow label="Focus today" value={`${summary.focusMinutes}m`} icon="timer-outline" />
            <StatRow
              label="Completed"
              value={`${summary.completedToday}`}
              icon="checkmark-done-outline"
              color={theme.colors.success}
            />
          </View>
        </View>

        {/* Capture */}
        <SmartInput
          onSubmit={async (text, attachments) => {
            const created = await addTaskFromInput(text, { projectId: activeProjectId });
            if (created && attachments.length > 0) {
              await patchTask(created.id, { attachments });
            }
          }}
          hint="Dates, times, #tags and !priority are detected as you type."
        />

        {/* Project filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.sm }}
        >
          <Pressable onPress={() => setActiveProjectId(null)}>
            <FilterPill label="All" active={activeProjectId === null} />
          </Pressable>
          {projects
            .filter((project) => !project.isArchived)
            .map((project) => (
              <Pressable key={project.id} onPress={() => setActiveProjectId(project.id)}>
                <FilterPill label={project.name} color={project.color} active={activeProjectId === project.id} />
              </Pressable>
            ))}
        </ScrollView>

        <ViewSwitcher value={view} onChange={setView} />

        {banner ? (
          <View
            style={{
              backgroundColor: theme.colors.accentSoft,
              borderRadius: theme.radii.md,
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
            }}
          >
            <Text variant="caption" color={theme.colors.accent}>
              {banner}
            </Text>
          </View>
        ) : null}

        {/* Content */}
        {view === 'list' ? (
          <View style={{ gap: theme.spacing.sm }}>
            {todayTasks.length > 0 && activeProjectId === null && !search ? (
              <Text variant="label" color={theme.colors.textSecondary}>
                Today
              </Text>
            ) : null}

            {listTasks.length === 0 ? (
              <EmptyState
                icon="checkmark-done-outline"
                title={search ? 'No matches' : 'All clear'}
                subtitle={
                  search
                    ? 'Try a different search term.'
                    : 'Add your first task above — try “Review designs tomorrow 4pm #work !high”.'
                }
              />
            ) : (
              listTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  allTasks={tasks}
                  onToggle={toggleTask}
                  onPress={handleOpen}
                  onDelete={handleDelete}
                  onBreakDown={handleBreakDown}
                />
              ))
            )}
          </View>
        ) : null}

        {view === 'kanban' ? (
          <KanbanBoard tasks={visibleTasks} onOpen={handleOpen} onMove={handleMove} />
        ) : null}

        {view === 'calendar' ? <CalendarAgenda tasks={visibleTasks} onOpen={handleOpen} /> : null}

        {view === 'matrix' ? <EisenhowerMatrix tasks={visibleTasks} onOpen={handleOpen} /> : null}
      </ScrollView>

      {/* Expandable quick-add FAB */}
      {fabOpen ? (
        <View style={{ position: 'absolute', right: 20, bottom: 96, alignItems: 'flex-end', gap: theme.spacing.sm }}>
          <FabAction
            icon="timer-outline"
            label="Start focus"
            onPress={() => {
              setFabOpen(false);
              router.push('/focus');
            }}
          />
          <FabAction
            icon="folder-outline"
            label="New project"
            onPress={() => {
              setFabOpen(false);
              void useStore.getState().addProject(`Project ${projects.length + 1}`);
            }}
          />
          <FabAction
            icon="sparkles-outline"
            label="Break down a task"
            onPress={() => {
              setFabOpen(false);
              setBanner('Long-press any task to break it down with AI');
              setTimeout(() => setBanner(null), 2600);
            }}
          />
        </View>
      ) : null}

      <ScalePress
        haptic={false}
        onPress={() => {
          tapLight();
          setFabOpen((open) => !open);
        }}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accent,
          shadowColor: theme.colors.accent,
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}
      >
        <Animated.View style={{ transform: [{ rotate: fabOpen ? '45deg' : '0deg' }] }}>
          <Ionicons name="add" size={28} color={theme.colors.accentContrast} />
        </Animated.View>
      </ScalePress>
    </View>
  );
}

function StatRow({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Ionicons name={icon} size={15} color={color ?? theme.colors.textSecondary} />
      <Text variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={color ?? theme.colors.textPrimary}>
        {value}
      </Text>
    </View>
  );
}

function FilterPill({ label, active, color }: { label: string; active: boolean; color?: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderRadius: theme.radii.pill,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? theme.colors.accent : theme.colors.border,
      }}
    >
      {color ? (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      ) : null}
      <Text
        variant="caption"
        color={active ? theme.colors.accentContrast : theme.colors.textSecondary}
        style={{ fontWeight: '600' }}
      >
        {label}
      </Text>
    </View>
  );
}

function FabAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.surfaceElevated,
        borderRadius: theme.radii.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        paddingVertical: 9,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Ionicons name={icon} size={15} color={theme.colors.accent} />
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}
