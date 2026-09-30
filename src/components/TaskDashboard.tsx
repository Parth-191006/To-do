import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';

import type { TaskStatus, TaskWithTags } from '@/domain/types';
import {
  applyFilters,
  isDueToday,
  isOpen,
  isOverdue,
  sortByUrgency,
  summarizeDay,
  topLevel,
} from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { tapHeavy, tapLight } from '@/utils/haptics';

import { ProjectSheet } from './ProjectSheet';
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
  const activeProjectId = useStore((s) => s.activeProjectId);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const removeProject = useStore((s) => s.removeProject);
  const addTaskFromInput = useStore((s) => s.addTaskFromInput);
  const toggleTask = useStore((s) => s.toggleTask);
  const removeTask = useStore((s) => s.removeTask);
  const patchTask = useStore((s) => s.patchTask);
  const breakDownTask = useStore((s) => s.breakDownTask);

  const [fabOpen, setFabOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [projectSheet, setProjectSheet] = useState<{ open: boolean; editing: string | null }>({
    open: false,
    editing: null,
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const flash = useCallback((message: string, ms = 2400) => {
    setBanner(message);
    setTimeout(() => setBanner(null), ms);
  }, []);

  const focusSecondsToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return focusSessions
      .filter((session) => session.kind === 'focus' && new Date(session.startedAt) >= start)
      .reduce((total, session) => total + session.durationSeconds, 0);
  }, [focusSessions]);

  const summary = useMemo(() => summarizeDay(tasks, focusSecondsToday), [focusSecondsToday, tasks]);

  const visibleTasks = useMemo(
    () => sortByUrgency(applyFilters(tasks, { projectId: activeProjectId, tagId: null, search })),
    [activeProjectId, search, tasks],
  );

  const todayTasks = useMemo(
    () => sortByUrgency(topLevel(tasks).filter((task) => isDueToday(task) || isOverdue(task))),
    [tasks],
  );

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const editingProject = useMemo(
    () => projects.find((project) => project.id === projectSheet.editing) ?? null,
    [projectSheet.editing, projects],
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
      flash('Task deleted', 1800);
    },
    [flash, removeTask],
  );

  const handleMove = useCallback(
    (id: string, status: TaskStatus) => {
      void patchTask(id, { status });
    },
    [patchTask],
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        flash('Tap delete again to remove the list and its tasks', 3200);
        return;
      }
      setConfirmDeleteId(null);
      await removeProject(id);
      flash('List deleted');
    },
    [confirmDeleteId, flash, removeProject],
  );

  const listTasks = view === 'list' ? visibleTasks.filter((task) => task.parentId === null) : [];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150, gap: theme.spacing.lg }}
      >
        {/* Hero: greeting + today at a glance */}
        <LinearGradient
          colors={theme.colors.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: theme.radii['2xl'],
            padding: theme.spacing.lg,
            gap: theme.spacing.lg,
            shadowColor: theme.colors.accent,
            shadowOpacity: 0.32,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 5,
          }}
        >
          <View style={{ gap: 2 }}>
            <Text variant="caption" color="rgba(255,255,255,0.78)">
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <Text variant="display" color="#FFFFFF">
              {greeting()}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
            <ProgressRing
              progress={summary.completionRatio}
              size={88}
              strokeWidth={10}
              color="#FFFFFF"
              trackColor="rgba(255,255,255,0.24)"
            >
              <Text variant="title" color="#FFFFFF">
                {Math.round(summary.completionRatio * 100)}%
              </Text>
              <Text variant="micro" color="rgba(255,255,255,0.8)">
                DONE
              </Text>
            </ProgressRing>

            <View style={{ flex: 1, gap: theme.spacing.sm }}>
              <HeroStat label="Open today" value={`${summary.openTasks}`} icon="today-outline" />
              <HeroStat
                label="Overdue"
                value={`${summary.overdue}`}
                icon="alert-circle-outline"
                dim={summary.overdue === 0}
              />
              <HeroStat label="Focus today" value={`${summary.focusMinutes}m`} icon="timer-outline" />
              <HeroStat
                label="Completed"
                value={`${summary.completedToday}`}
                icon="checkmark-done-outline"
              />
            </View>
          </View>
        </LinearGradient>

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
          <Pressable onPress={() => setActiveProject(null)}>
            <FilterPill label="All" active={activeProjectId === null} />
          </Pressable>
          {projects
            .filter((project) => !project.isArchived)
            .map((project) => (
              <Pressable key={project.id} onPress={() => setActiveProject(project.id)}>
                <FilterPill
                  label={project.name}
                  color={project.color}
                  active={activeProjectId === project.id}
                  count={project.openTasks}
                />
              </Pressable>
            ))}
          <Pressable
            onPress={() => {
              tapLight();
              setProjectSheet({ open: true, editing: null });
            }}
          >
            <FilterPill label="New list" icon="add" active={false} />
          </Pressable>
        </ScrollView>

        {/* Active-project toolbar — the entry point the app was missing. */}
        {activeProject ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: activeProject.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="folder" size={13} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {activeProject.name}
              </Text>
              <Text variant="micro" color={theme.colors.textTertiary}>
                {activeProject.openTasks} OPEN · {activeProject.totalTasks} TOTAL
              </Text>
            </View>
            <MiniAction
              icon="open-outline"
              label="Open"
              onPress={() => router.push(`/project/${activeProject.id}`)}
            />
            <MiniAction
              icon="create-outline"
              label="Rename"
              onPress={() => setProjectSheet({ open: true, editing: activeProject.id })}
            />
            <MiniAction
              icon="trash-outline"
              label={confirmDeleteId === activeProject.id ? 'Sure?' : 'Delete'}
              tint={theme.colors.danger}
              onPress={() => void handleDeleteProject(activeProject.id)}
            />
          </View>
        ) : null}

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
            label="New list"
            onPress={() => {
              setFabOpen(false);
              setProjectSheet({ open: true, editing: null });
            }}
          />
          <FabAction
            icon="sparkles-outline"
            label="Break down a task"
            onPress={() => {
              setFabOpen(false);
              flash('Long-press any task to break it down with AI', 2800);
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
          borderRadius: 28,
          overflow: 'hidden',
          shadowColor: theme.colors.accent,
          shadowOpacity: 0.45,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 7,
        }}
      >
        <LinearGradient
          colors={theme.colors.accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}
        >
          <Animated.View style={{ transform: [{ rotate: fabOpen ? '45deg' : '0deg' }] }}>
            <Ionicons name="add" size={28} color={theme.colors.accentContrast} />
          </Animated.View>
        </LinearGradient>
      </ScalePress>

      <ProjectSheet
        visible={projectSheet.open}
        project={editingProject}
        onClose={() => setProjectSheet({ open: false, editing: null })}
        onCreated={(project) => {
          setActiveProject(project.id);
          flash(`“${project.name}” created — add your first task below`);
        }}
      />
    </View>
  );
}

function HeroStat({
  label,
  value,
  icon,
  dim = false,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  dim?: boolean;
}) {
  const tint = dim ? 'rgba(255,255,255,0.6)' : '#FFFFFF';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name={icon} size={14} color={tint} />
      <Text variant="caption" color="rgba(255,255,255,0.82)" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={tint}>
        {value}
      </Text>
    </View>
  );
}

function MiniAction({
  icon,
  label,
  onPress,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tint?: string;
}) {
  const theme = useTheme();
  const color = tint ?? theme.colors.accent;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 6,
        paddingHorizontal: 9,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.surfaceSunken,
      }}
    >
      <Ionicons name={icon} size={12} color={color} />
      <Text variant="micro" color={color}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

function FilterPill({
  label,
  active,
  color,
  count,
  icon,
}: {
  label: string;
  active: boolean;
  color?: string;
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
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
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={theme.colors.accent} /> : null}
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
      {typeof count === 'number' && count > 0 ? (
        <Text variant="micro" color={active ? 'rgba(255,255,255,0.85)' : theme.colors.textTertiary}>
          {count}
        </Text>
      ) : null}
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
        borderWidth: 1,
        borderColor: theme.colors.border,
        paddingVertical: 10,
        paddingHorizontal: theme.spacing.lg,
        shadowColor: theme.colors.shadow,
        shadowOpacity: 0.22,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      }}
    >
      <Ionicons name={icon} size={15} color={theme.colors.accent} />
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}
