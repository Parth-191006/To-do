import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { TaskStatus, TaskWithTags } from '@/domain/types';
import {
  applyFilters,
  isDueToday,
  isOpen,
  isOverdue,
  sortByUrgency,
  summarizeDay,
} from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { selection, success, tapHeavy, tapLight } from '@/utils/haptics';

import { Confetti, type ConfettiHandle } from './Confetti';
import { ProjectSheet } from './ProjectSheet';
import { SmartInput } from './SmartInput';
import { TaskCard } from './TaskCard';
import { ViewSwitcher } from './ViewSwitcher';
import { Chip, EmptyState, ScalePress, Text } from './ui';
import { CalendarAgenda } from './views/CalendarAgenda';
import { EisenhowerMatrix } from './views/EisenhowerMatrix';
import { KanbanBoard } from './views/KanbanBoard';

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Examples that teach the capture syntax by doing it. Tapping one adds it, so
 * "how does the natural-language input work?" is answered by the empty state
 * itself rather than by a paragraph of instructions.
 */
const EXAMPLES: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Review designs tomorrow 4pm', value: 'Review designs tomorrow 4pm #work !high ~45m', icon: 'calendar-outline' },
  { label: 'Call the dentist every month', value: 'Call the dentist every month !medium', icon: 'repeat-outline' },
  { label: 'Buy milk when I reach the shop', value: 'Buy groceries tomorrow 6pm #errands ~30m', icon: 'pricetags-outline' },
];

/** A slice of the day, ordered the way the list below is ordered. */
interface TaskSection {
  key: string;
  label: string;
  tasks: TaskWithTags[];
  /** Tint the header when the section needs attention (overdue). */
  attention?: boolean;
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
  const restoreTask = useStore((s) => s.restoreTask);
  const patchTask = useStore((s) => s.patchTask);
  const breakDownTask = useStore((s) => s.breakDownTask);

  const [fabOpen, setFabOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  /** Id of the task the undo affordance would bring back. */
  const [undoId, setUndoId] = useState<string | null>(null);
  const celebrateRef = useRef<ConfettiHandle>(null);
  /** Fires the "all done" celebration once per completed-then-empty cycle. */
  const celebratedRef = useRef(false);
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

  /**
   * The list view is sorted into day-shaped buckets so "what should I do next"
   * is answered top-down: Overdue → Today → Upcoming → Anytime → Completed.
   * Everything else (board, agenda, matrix) keeps its own ordering.
   */
  const sections = useMemo<TaskSection[]>(() => {
    const topLevelTasks = visibleTasks.filter((task) => task.parentId === null);
    const buckets: Record<string, TaskWithTags[]> = {
      overdue: [],
      today: [],
      upcoming: [],
      anytime: [],
      completed: [],
    };

    for (const task of topLevelTasks) {
      if (!isOpen(task)) buckets.completed.push(task);
      else if (isOverdue(task)) buckets.overdue.push(task);
      else if (isDueToday(task)) buckets.today.push(task);
      else if (task.dueAt) buckets.upcoming.push(task);
      else buckets.anytime.push(task);
    }

    const built: TaskSection[] = [
      { key: 'overdue', label: 'Overdue', tasks: buckets.overdue, attention: true },
      { key: 'today', label: 'Today', tasks: buckets.today },
      { key: 'upcoming', label: 'Upcoming', tasks: buckets.upcoming },
      { key: 'anytime', label: 'Anytime', tasks: buckets.anytime },
      { key: 'completed', label: 'Completed', tasks: buckets.completed },
    ];
    return built.filter((section) => section.tasks.length > 0);
  }, [visibleTasks]);

  const hasAnyTasks = sections.length > 0;

  /** True when every visible top-level task is finished — the celebration cue. */
  const allDone = useMemo(() => {
    const top = visibleTasks.filter((task) => task.parentId === null);
    return top.length > 0 && top.every((task) => !isOpen(task));
  }, [visibleTasks]);

  // Finishing the last task deserves a moment: a burst of confetti and a haptic,
  // fired once per empty-then-full cycle so it never spams.
  useEffect(() => {
    if (!allDone || view !== 'list') {
      celebratedRef.current = false;
      return;
    }
    if (celebratedRef.current) return;
    celebratedRef.current = true;
    success();
    celebrateRef.current?.fire();
  }, [allDone, view]);

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

  /**
   * Swipe-to-delete is recoverable: the task is soft-deleted, so the banner
   * offers a real undo instead of the two-tap confirmation used elsewhere.
   */
  const handleDelete = useCallback(
    (id: string) => {
      void removeTask(id);
      setUndoId(id);
      flash('Task deleted', 3200);
    },
    [flash, removeTask],
  );

  const handleUndo = useCallback(() => {
    if (!undoId) return;
    void restoreTask(undoId);
    setUndoId(null);
    flash('Task restored');
  }, [flash, restoreTask, undoId]);

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

  return (
    <View style={{ flex: 1 }}>
      <Confetti ref={celebrateRef} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150, gap: theme.spacing.md }}
      >
        {/*
          Greeting — date and greeting share one line at a smaller size than
          before. Together with the compact switcher this is what puts the first
          task above the fold on a 5-inch phone.
        */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
          <Text variant="title">{greeting()}</Text>
          <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
        </View>

        {/* Day at a glance — four numbers and one bar, no card chrome. */}
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row' }}>
            <StatColumn
              icon="today-outline"
              value={`${summary.openTasks}`}
              label="DUE TODAY"
            />
            <StatColumn
              icon="alert-circle-outline"
              value={`${summary.overdue}`}
              label="OVERDUE"
              tint={summary.overdue > 0 ? theme.colors.danger : undefined}
            />
            <StatColumn icon="timer-outline" value={`${summary.focusMinutes}m`} label="FOCUS" />
            <StatColumn
              icon="checkmark-done-outline"
              value={`${summary.completedToday}`}
              label="DONE"
              tint={summary.completedToday > 0 ? theme.colors.success : undefined}
            />
          </View>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.surfaceSunken,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.round(summary.completionRatio * 100)}%`,
                height: '100%',
                borderRadius: 2,
                backgroundColor: theme.colors.accent,
              }}
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
          hint="Type naturally — dates, times, #tags, !priority and ~estimates are read automatically."
        />

        {/*
          List chips and the view switcher share one row: the chips scroll,
          the switcher stays docked on the right. Two rows became one, which is
          the difference between the first task being visible and not.
        */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.sm }}
          >
          <Pressable
            onPress={() => {
              selection();
              setActiveProject(null);
            }}
          >
            <FilterPill label="All" active={activeProjectId === null} />
          </Pressable>
          {projects
            .filter((project) => !project.isArchived)
            .map((project) => (
              <Pressable
                key={project.id}
                onPress={() => {
                  selection();
                  setActiveProject(project.id);
                }}
              >
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
          <ViewSwitcher value={view} onChange={setView} />
        </View>

        {/* Active-project toolbar — rename / open / delete without leaving the tab. */}
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

        {/* Undo banner + (rarely) status messages — one strip, not two. */}
        {banner ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              backgroundColor: theme.colors.accentSoft,
              borderRadius: theme.radii.md,
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
            }}
          >
            <Text variant="caption" color={theme.colors.accent} style={{ flex: 1 }}>
              {banner}
            </Text>
            {undoId ? (
              <Chip
                label="Undo"
                icon="arrow-undo-outline"
                accessibilityLabel="Restore the deleted task"
                onPress={handleUndo}
              />
            ) : null}
          </View>
        ) : null}

        {/* Content */}
        {view === 'list' ? (
          !hasAnyTasks ? (
            <EmptyState
              icon="checkmark-done-outline"
              title={search ? 'No matches' : 'All clear'}
              subtitle={
                search
                  ? 'Try a different search term.'
                  : 'Nothing needs you right now. Add something above — or tap an example and watch the parser build the task:'
              }
            >
              {search ? null : (
                <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm, width: '100%' }}>
                  {EXAMPLES.map((example) => (
                    <Pressable
                      key={example.value}
                      onPress={() => {
                        selection();
                        void addTaskFromInput(example.value, { projectId: activeProjectId });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Add the example task: ${example.label}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        minHeight: 48,
                        paddingVertical: theme.spacing.sm,
                        paddingHorizontal: theme.spacing.md,
                        borderRadius: theme.radii.lg,
                        backgroundColor: theme.colors.surface,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Ionicons name={example.icon} size={15} color={theme.colors.accent} />
                      <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                        {example.label}
                      </Text>
                      <Ionicons name="add" size={15} color={theme.colors.textTertiary} />
                    </Pressable>
                  ))}
                </View>
              )}
            </EmptyState>
          ) : (
            <View style={{ gap: theme.spacing.xl }}>
              {sections.map((section) => (
                <View key={section.key} style={{ gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: section.attention
                          ? theme.colors.danger
                          : theme.colors.accent,
                      }}
                    />
                    <Text
                      variant="micro"
                      color={
                        section.attention ? theme.colors.danger : theme.colors.textSecondary
                      }
                    >
                      {section.label.toUpperCase()}
                    </Text>
                    <View
                      style={{
                        minWidth: 18,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: theme.radii.pill,
                        backgroundColor: theme.colors.surfaceSunken,
                        alignItems: 'center',
                      }}
                    >
                      <Text variant="micro" color={theme.colors.textTertiary}>
                        {section.tasks.length}
                      </Text>
                    </View>
                  </View>
                  {section.tasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      allTasks={tasks}
                      onToggle={toggleTask}
                      onPress={handleOpen}
                      onDelete={handleDelete}
                      onBreakDown={handleBreakDown}
                    />
                  ))}
                </View>
              ))}

              {/* Gestures are invisible unless they are named somewhere. */}
              <Text variant="caption" color={theme.colors.textSecondary} align="center">
                Swipe right to complete · swipe left to delete · hold for an AI breakdown
              </Text>
            </View>
          )
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
            icon="folder-outline"
            label="New list"
            onPress={() => {
              setFabOpen(false);
              setProjectSheet({ open: true, editing: null });
            }}
          />
          <FabAction
            icon="timer-outline"
            label="Start focus"
            onPress={() => {
              setFabOpen(false);
              router.push('/focus');
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

/**
 * One number + a micro label, with an icon so each figure is self-describing.
 * Four of these replace the old gradient hero.
 */
function StatColumn({
  icon,
  value,
  label,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  tint?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={icon} size={12} color={tint ?? theme.colors.textTertiary} />
        <Text variant="micro" color={tint ?? theme.colors.textTertiary} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="title" color={tint ?? theme.colors.textPrimary}>
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
        <Text
          variant="micro"
          color={active ? theme.colors.accentContrast : theme.colors.textTertiary}
        >
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
