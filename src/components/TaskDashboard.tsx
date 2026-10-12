import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';

import type { TaskStatus, TaskWithTags } from '@/domain/types';
import {
  applyFilters,
  isDueToday,
  isOpen,
  isOverdue,
  sortByUrgency,
  summarizeDay,
  type DaySummary,
} from '@/store/selectors';
import { useStore } from '@/store/useStore';
import { useTheme } from '@/theme/ThemeProvider';
import { elevation } from '@/theme/tokens';
import { selection, success, tapHeavy, tapLight } from '@/utils/haptics';

import { usePreferences } from '@/store/usePreferences';

import { Confetti, type ConfettiHandle } from './Confetti';
import { ProgressRing } from './ProgressRing';
import { ProjectSheet } from './ProjectSheet';
import { ReviewCard } from './ReviewCard';
import { SmartInput } from './SmartInput';
import { TaskCard } from './TaskCard';
import { ViewSwitcher } from './ViewSwitcher';
import { Chip, EmptyState, ScalePress, SectionLabel, Text } from './ui';
import { CalendarAgenda } from './views/CalendarAgenda';
import { EisenhowerMatrix } from './views/EisenhowerMatrix';
import { KanbanBoard } from './views/KanbanBoard';

/**
 * Examples that teach the capture syntax by doing it. Tapping one adds it, so
 * "how does the natural-language input work?" is answered by three tappable
 * lines rather than a paragraph of instructions.
 */
const EXAMPLES: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Review designs tomorrow 4pm', value: 'Review designs tomorrow 4pm #work !high ~45m', icon: 'calendar-outline' },
  { label: 'Call the dentist every month', value: 'Call the dentist every month !medium', icon: 'repeat-outline' },
  { label: 'Buy milk when I reach the shop', value: 'Buy groceries tomorrow 6pm #errands ~30m', icon: 'pricetags-outline' },
];

/**
 * The one sentence the day's ring is illustrating. Kept short on purpose: the
 * ring already carries the percentage, so the copy only has to say what the
 * percentage is *of*.
 */
function dayHeadline(summary: DaySummary): string {
  if (summary.openTasks === 0) {
    return summary.completedToday > 0 ? 'Today is done' : 'Nothing due today';
  }
  return `${summary.openTasks} left today`;
}

/** A quiet tally of the numbers that are not zero — no grid of stat labels. */
function dayTally(summary: DaySummary): string | null {
  const parts = [
    summary.overdue > 0 ? `${summary.overdue} overdue` : null,
    summary.completedToday > 0 ? `${summary.completedToday} done` : null,
    summary.focusMinutes > 0 ? `${summary.focusMinutes}m focus` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

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
  const setStatus = useStore((s) => s.setStatus);
  const breakDownTask = useStore((s) => s.breakDownTask);

  const templates = usePreferences((s) => s.templates);
  const removeTemplate = usePreferences((s) => s.removeTemplate);
  const lastTaskText = usePreferences((s) => s.lastTaskText);
  const setLastTaskText = usePreferences((s) => s.setLastTaskText);

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

  // Through the store's status path, not a field patch: that path stamps
  // `completed_at` and cancels or re-arms the task's reminders, so a task moved
  // to Done on the board counts as completed everywhere else in the app.
  const handleMove = useCallback(
    (id: string, status: TaskStatus) => {
      void setStatus(id, status);
    },
    [setStatus],
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
          Day at a glance: one ring, one sentence, one tally line.

          This row replaces a four-column stat grid, a progress bar and a row of
          uppercase labels. The ring already states the percentage, so the copy
          underneath only names the numbers that are not zero — an empty day
          says nothing extra, which is what makes it read as calm.
        */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          <ProgressRing progress={summary.completionRatio} size={60} strokeWidth={6}>
            <Text variant="caption" color={theme.colors.textSecondary}>
              {`${Math.round(summary.completionRatio * 100)}%`}
            </Text>
          </ProgressRing>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading">{dayHeadline(summary)}</Text>
            {dayTally(summary) ? (
              <Text variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
                {dayTally(summary)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Morning plan / evening wrap-up — one card, at most once a half-day. */}
        <ReviewCard />

        {/* Capture */}
        <SmartInput
          onSubmit={async (text, attachments) => {
            const created = await addTaskFromInput(text, { projectId: activeProjectId });
            if (created && attachments.length > 0) {
              await patchTask(created.id, { attachments });
            }
            // Remembered for the "Repeat last" chip — the most common task is
            // often the one you created a moment ago.
            setLastTaskText(text.trim() || null);
          }}
          hint="Dates, #tags, !priority and ~estimates are read as you type."
        />

        {/* Repeat last + saved templates. Long-press a template to forget it. */}
        {lastTaskText || templates.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.sm }}
          >
            {lastTaskText ? (
              <Chip
                label="Repeat last"
                icon="refresh-outline"
                accessibilityLabel="Add the task you captured last"
                onPress={() => {
                  selection();
                  void addTaskFromInput(lastTaskText, { projectId: activeProjectId });
                }}
              />
            ) : null}
            {templates.map((template) => (
              <Chip
                key={template.id}
                label={template.label}
                icon="bookmark-outline"
                accessibilityLabel={`Add the template ${template.text}. Long press to forget it.`}
                onPress={() => {
                  selection();
                  void addTaskFromInput(template.text, { projectId: activeProjectId });
                }}
                onLongPress={() => {
                  tapHeavy();
                  removeTemplate(template.id);
                  flash('Template forgotten');
                }}
              />
            ))}
          </ScrollView>
        ) : null}

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
            accessibilityRole="button"
            accessibilityState={{ selected: activeProjectId === null }}
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
                accessibilityRole="button"
                accessibilityState={{ selected: activeProjectId === project.id }}
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
              accessibilityRole="button"
              accessibilityLabel="New list"
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
              <Text variant="caption" color={theme.colors.textTertiary}>
                {activeProject.openTasks} open
              </Text>
            </View>
            <MiniAction
              icon="open-outline"
              label="Open list"
              onPress={() => router.push(`/project/${activeProject.id}`)}
            />
            <MiniAction
              icon="create-outline"
              label="Rename list"
              onPress={() => setProjectSheet({ open: true, editing: activeProject.id })}
            />
            <MiniAction
              icon="trash-outline"
              label={confirmDeleteId === activeProject.id ? 'Confirm delete list' : 'Delete list'}
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
              subtitle={search ? 'Try a different search term.' : 'Nothing needs you today.'}
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
                        borderRadius: theme.radii.pill,
                        backgroundColor: theme.colors.surface,
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
                  <SectionLabel
                    label={section.label}
                    count={section.tasks.length}
                    tint={section.attention ? theme.colors.danger : undefined}
                  />
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
            </View>
          )
        ) : null}

        {view === 'kanban' ? (
          <KanbanBoard tasks={visibleTasks} onOpen={handleOpen} onMove={handleMove} />
        ) : null}

        {view === 'calendar' ? (
          <CalendarAgenda tasks={visibleTasks} onOpen={handleOpen} onToggle={toggleTask} />
        ) : null}

        {view === 'matrix' ? (
          <EisenhowerMatrix tasks={visibleTasks} onOpen={handleOpen} onToggle={toggleTask} />
        ) : null}
      </ScrollView>

      {/* Expandable quick-add FAB — two actions, each a real destination. */}
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
        </View>
      ) : null}

      <ScalePress
        haptic={false}
        onPress={() => {
          tapLight();
          setFabOpen((open) => !open);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: fabOpen }}
        accessibilityLabel={fabOpen ? 'Close quick actions' : 'Open quick actions'}
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
 * A 40dp icon button for the active-list toolbar. It used to spell its label
 * out in caps next to the icon; three chips of uppercase text under a list name
 * was more chrome than the list itself. The icon stays named for TalkBack.
 */
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
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radii.pill,
      }}
    >
      <Ionicons name={icon} size={17} color={tint ?? theme.colors.textSecondary} />
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
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: theme.radii.pill,
        // Unselected list chips are a flat tint rather than an outlined pill,
        // so a row of six lists reads as a set of choices instead of a form.
        backgroundColor: active ? theme.colors.accent : theme.colors.surfaceSunken,
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
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.surfaceElevated,
        borderRadius: theme.radii.pill,
        paddingVertical: 10,
        paddingHorizontal: theme.spacing.lg,
        ...elevation.floating,
        shadowColor: theme.colors.shadow,
      }}
    >
      <Ionicons name={icon} size={15} color={theme.colors.accent} />
      <Text variant="caption">{label}</Text>
    </Pressable>
  );
}
