import { create } from 'zustand';

import {
  createTask,
  getTask,
  listTasks,
  restoreTask as restoreTaskRepo,
  searchTasks as searchTasksRepo,
  softDeleteTask,
  toggleTaskComplete,
  updateTask as updateTaskRepo,
  type TaskDraft,
} from '@/db/repositories/tasks';
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
  type ProjectWithStats,
} from '@/db/repositories/projects';
import { findOrCreateTag, listTags } from '@/db/repositories/tags';
import {
  bumpHabitLog,
  createHabit as createHabitRepo,
  habitToggleDelta,
  listAllHabitLogs,
  listHabits,
  updateHabit,
} from '@/db/repositories/habits';
import { syncHabitReminder } from '@/services/notifications/scheduler';
import { endFocusSession, listFocusSessions, startFocusSession } from '@/db/repositories/focus';
import { logActivity } from '@/db/repositories/activity';
import type {
  FocusSession,
  Habit,
  HabitLog,
  Project,
  Tag,
  TaskView,
  TaskWithTags,
} from '@/domain/types';
import { parseTaskInput } from '@/nlp/parser';
import { generateBreakdown } from '@/services/ai/breakdown';
import { scheduleTaskNotifications, cancelTaskNotifications } from '@/services/notifications/scheduler';
import { syncGeofences } from '@/services/notifications/geofence';
import { toDateKey } from '@/utils/id';

export type StoreStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Optional daily nudge attached to a habit. */
export interface HabitReminderInput {
  hour: number;
  minute?: number;
}

interface AddTaskOverrides {
  projectId?: string | null;
  parentId?: string | null;
}

export interface AppState {
  status: StoreStatus;
  error: string | null;

  tasks: TaskWithTags[];
  projects: ProjectWithStats[];
  tags: Tag[];
  habits: Habit[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];

  activeProjectId: string | null;
  activeTagId: string | null;
  view: TaskView;
  search: string;

  /** Last actionable-notification outcome, surfaced as a toast by the UI. */
  lastOutcome: string | null;

  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshTasks: () => Promise<void>;

  addTaskFromInput: (raw: string, overrides?: AddTaskOverrides) => Promise<TaskWithTags | null>;
  addTask: (draft: TaskDraft) => Promise<TaskWithTags>;
  patchTask: (id: string, patch: TaskDraft) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  /** Undo for the swipe-to-delete gesture. */
  restoreTask: (id: string) => Promise<void>;
  breakDownTask: (id: string) => Promise<number>;

  addProject: (name: string, color?: string) => Promise<Project | null>;
  updateProjectMeta: (
    id: string,
    patch: { name?: string; color?: string; icon?: string },
  ) => Promise<void>;
  removeProject: (id: string) => Promise<void>;

  addHabit: (name: string, color?: string, reminder?: HabitReminderInput) => Promise<void>;
  archiveHabit: (habitId: string) => Promise<void>;
  toggleHabitToday: (habitId: string) => Promise<void>;
  /** Sets (or clears, with null) a habit's daily nudge time. */
  setHabitReminder: (habitId: string, reminder: HabitReminderInput | null) => Promise<void>;
  /** Weekly target days — 0 = Sunday … 6 = Saturday; empty means every day. */
  setHabitWeekdays: (habitId: string, byWeekday: number[]) => Promise<void>;

  beginFocus: (taskId?: string | null, projectId?: string | null) => Promise<FocusSession>;
  finishFocus: (id: string, durationSeconds: number, completed: boolean) => Promise<void>;

  /** FTS5-backed search over titles and notes; relevance-ordered. */
  searchTasks: (query: string) => Promise<TaskWithTags[]>;

  setView: (view: TaskView) => void;
  setActiveProject: (projectId: string | null) => void;
  setActiveTag: (tagId: string | null) => void;
  setSearch: (search: string) => void;
  setLastOutcome: (message: string | null) => void;
}

type StoreSet = (partial: Partial<AppState>) => void;

/**
 * Runs a mutating repository call and turns any throw into a visible toast.
 *
 * Every screen used to call these actions with a bare `void`, so a failed write
 * (locked database, bad value, full disk) produced *nothing* — the button just
 * appeared dead. Surfacing the message on `lastOutcome` is what makes that
 * class of failure self-explanatory on a real phone.
 */
async function guard<T>(
  set: StoreSet,
  fallback: string,
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    set({ lastOutcome: error instanceof Error ? error.message : fallback });
    return null;
  }
}

async function loadEverything() {
  const [projects, tags, tasks, habits, habitLogs, focusSessions] = await Promise.all([
    listProjects(true),
    listTags(),
    listTasks({ status: 'all', includeCompleted: true }),
    listHabits(true),
    listAllHabitLogs(),
    listFocusSessions(),
  ]);
  return { projects, tags, tasks, habits, habitLogs, focusSessions };
}

export const useStore = create<AppState>()((set, get) => ({
  status: 'idle',
  error: null,

  tasks: [],
  projects: [],
  tags: [],
  habits: [],
  habitLogs: [],
  focusSessions: [],

  activeProjectId: null,
  activeTagId: null,
  view: 'list',
  search: '',
  lastOutcome: null,

  async bootstrap() {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });
    try {
      const data = await loadEverything();
      set({ ...data, status: 'ready' });
      const withLocation = data.tasks.filter((task) => task.locationReminder);
      if (withLocation.length > 0) {
        await syncGeofences(withLocation).catch(() => undefined);
      }
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to open the database',
      });
    }
  },

  async refresh() {
    const data = await loadEverything();
    set(data);
  },

  async refreshTasks() {
    const tasks = await listTasks({ status: 'all', includeCompleted: true });
    set({ tasks });
    // Every task mutation lands here, so this is the single place place
    // reminders need re-arming (add, edit, complete, delete). The sync is
    // signature-gated, so it costs one string compare when nothing about the
    // fences changed — previously they were only re-armed on a cold start.
    void syncGeofences(tasks).catch(() => undefined);
  },

  async addTaskFromInput(raw, overrides = {}) {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    return guard<TaskWithTags | null>(set, 'Could not save that task', async () => {
      const parsed = parseTaskInput(trimmed);
      const title = parsed.title || trimmed;

      // Resolve #tags into real rows (create-on-first-use).
      const tagIds: string[] = [];
      for (const name of parsed.tags) {
        const tag = await findOrCreateTag(name);
        tagIds.push(tag.id);
      }

      // Resolve @project against an existing project by name, else Inbox.
      let projectId = overrides.projectId ?? null;
      if (projectId === null && parsed.projectHint) {
        const match = get().projects.find(
          (project) => project.name.toLowerCase() === parsed.projectHint!.toLowerCase(),
        );
        projectId = match?.id ?? null;
      }

      const created = await createTask({
        title,
        projectId,
        parentId: overrides.parentId ?? null,
        priority: parsed.priority,
        dueAt: parsed.dueAt,
        remindAt: parsed.remindAt,
        recurrence: parsed.recurrence,
        estimateMinutes: parsed.estimateMinutes,
        tagIds,
      });

      await scheduleTaskNotifications(created).catch(() => undefined);
      await logActivity({
        entityKind: 'task',
        entityId: created.id,
        action: 'created',
        summary: `Created “${created.title}”`,
      });

      await get().refreshTasks();
      if (tagIds.length > 0) set({ tags: await listTags() });
      return created;
    });
  },

  async addTask(draft) {
    const created = await createTask(draft);
    await scheduleTaskNotifications(created).catch(() => undefined);
    await get().refreshTasks();
    return created;
  },

  async patchTask(id, patch) {
    await guard(set, 'Could not update that task', async () => {
      const updated = await updateTaskRepo(id, patch);
      if (updated) {
        await scheduleTaskNotifications(updated).catch(() => undefined);
      }
      await get().refreshTasks();
    });
  },

  async toggleTask(id) {
    await guard(set, 'Could not update that task', async () => {
      const next = await toggleTaskComplete(id);
      if (next === 'done') {
        await cancelTaskNotifications(id).catch(() => undefined);
      } else {
        const task = get().tasks.find((t) => t.id === id);
        if (task) await scheduleTaskNotifications({ ...task, status: next }).catch(() => undefined);
      }
      await get().refreshTasks();
    });
  },

  async removeTask(id) {
    await cancelTaskNotifications(id).catch(() => undefined);
    await guard(set, 'Could not delete that task', async () => {
      await softDeleteTask(id);
      await get().refreshTasks();
    });
  },

  /**
   * Puts a soft-deleted task (and its subtree) back. Deletes are recoverable by
   * design, so the swipe gesture can offer an undo instead of a confirmation
   * dialog — the task is only hidden, never erased.
   */
  async restoreTask(id) {
    await guard(set, 'Could not restore that task', async () => {
      await restoreTaskRepo(id);
      // The task is not in the store while it is deleted, so it has to be read
      // back from the database before its reminders can be re-armed.
      const task = await getTask(id);
      if (task) await scheduleTaskNotifications(task).catch(() => undefined);
      await get().refreshTasks();
    });
  },

  async breakDownTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return 0;

    const result = await guard(set, 'Could not break that task down', async () => {
      const { steps } = await generateBreakdown(task);
      for (const step of steps) {
        await createTask({
          title: step.title,
          parentId: task.id,
          projectId: task.projectId,
          // Each step carries its own priority and estimate now, instead of
          // every generated subtask inheriting the parent's priority verbatim.
          priority: step.priority,
          estimateMinutes: step.estimateMinutes,
        });
      }

      await logActivity({
        entityKind: 'task',
        entityId: id,
        action: 'breakdown',
        summary: `AI generated ${steps.length} subtasks for “${task.title}”`,
      });
      await get().refreshTasks();
      return steps.length;
    });

    return result ?? 0;
  },

  async addProject(name, color) {
    const created = await guard(set, 'Could not create that project', async () => {
      const project = await createProject({ name, color });
      await logActivity({
        entityKind: 'project',
        entityId: project.id,
        action: 'created',
        summary: `Created the list “${project.name}”`,
      });
      set({ projects: await listProjects(true) });
      return project;
    });
    return created ?? null;
  },

  async updateProjectMeta(id, patch) {
    await guard(set, 'Could not update that project', async () => {
      await updateProject(id, patch);
      set({ projects: await listProjects(true) });
    });
  },

  async removeProject(id) {
    await guard(set, 'Could not delete that project', async () => {
      await deleteProject(id);
      await get().refresh();
    });
    if (get().activeProjectId === id) set({ activeProjectId: null });
  },

  async addHabit(name, color, reminder) {
    await guard(set, 'Could not create that habit', async () => {
      const habit = await createHabitRepo({
        name,
        color,
        reminderHour: reminder?.hour ?? null,
        reminderMinute: reminder?.minute ?? 0,
      });
      // A habit created with a nudge arms it immediately — otherwise the
      // reminder only existed after the next app launch.
      await syncHabitReminder(habit);
      set({ habits: await listHabits(true) });
    });
  },

  /**
   * Archives a habit (soft delete). Without this a habit was unremovable —
   * there was a create button and no way back.
   */
  async archiveHabit(habitId) {
    await guard(set, 'Could not remove that habit', async () => {
      await updateHabit(habitId, { isArchived: true });
      // A removed habit must stop nudging, or the phone keeps asking about a
      // habit that no longer exists in the app.
      const habit = get().habits.find((entry) => entry.id === habitId);
      if (habit) {
        await syncHabitReminder({ ...habit, isArchived: true }).catch(() => undefined);
      }
      set({ habits: await listHabits(true) });
    });
  },

  /**
   * True toggle: checking a habit in logs it, checking it again removes it.
   * Previously this only ever incremented, so the checkmark shown in the UI
   * could never be undone.
   */
  async toggleHabitToday(habitId) {
    await guard(set, 'Could not update that habit', async () => {
      const today = toDateKey();
      const delta = habitToggleDelta(get().habitLogs, habitId, today);
      await bumpHabitLog(habitId, today, delta);
      set({ habitLogs: await listAllHabitLogs() });
    });
  },

  async setHabitReminder(habitId, reminder) {
    await guard(set, 'Could not update that habit', async () => {
      const hour = reminder === null ? null : reminder.hour;
      const minute = reminder === null ? null : reminder.minute ?? 0;
      await updateHabit(habitId, { reminderHour: hour, reminderMinute: minute });
      const habit = get().habits.find((entry) => entry.id === habitId);
      if (habit) {
        await syncHabitReminder({ ...habit, reminderHour: hour, reminderMinute: minute }).catch(
          () => undefined,
        );
      }
      set({ habits: await listHabits(true) });
    });
  },

  async setHabitWeekdays(habitId, byWeekday) {
    await guard(set, 'Could not update that habit', async () => {
      await updateHabit(habitId, { byWeekday });
      set({ habits: await listHabits(true) });
    });
  },

  async beginFocus(taskId = null, projectId = null) {
    const session = await startFocusSession({ taskId, projectId });
    set({ focusSessions: await listFocusSessions() });
    return session;
  },

  async finishFocus(id, durationSeconds, completed) {
    await endFocusSession(id, { durationSeconds, completed });
    set({ focusSessions: await listFocusSessions() });
  },

  async searchTasks(query) {
    try {
      return await searchTasksRepo(query);
    } catch {
      return [];
    }
  },

  setView(view) {
    set({ view });
  },
  setActiveProject(activeProjectId) {
    set({ activeProjectId });
  },
  setActiveTag(activeTagId) {
    set({ activeTagId });
  },
  setSearch(search) {
    set({ search });
  },
  setLastOutcome(lastOutcome) {
    set({ lastOutcome });
  },
}));
