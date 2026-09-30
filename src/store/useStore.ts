import { create } from 'zustand';

import {
  createTask,
  listTasks,
  softDeleteTask,
  toggleTaskComplete,
  updateTask as updateTaskRepo,
  type TaskDraft,
} from '@/db/repositories/tasks';
import { createProject, deleteProject, listProjects, type ProjectWithStats } from '@/db/repositories/projects';
import { findOrCreateTag, listTags } from '@/db/repositories/tags';
import {
  bumpHabitLog,
  createHabit as createHabitRepo,
  listAllHabitLogs,
  listHabits,
} from '@/db/repositories/habits';
import { endFocusSession, listFocusSessions, startFocusSession } from '@/db/repositories/focus';
import { logActivity } from '@/db/repositories/activity';
import type {
  FocusSession,
  Habit,
  HabitLog,
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
  breakDownTask: (id: string) => Promise<number>;

  addProject: (name: string, color?: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;

  addHabit: (name: string, color?: string) => Promise<void>;
  toggleHabitToday: (habitId: string) => Promise<void>;

  beginFocus: (taskId?: string | null, projectId?: string | null) => Promise<FocusSession>;
  finishFocus: (id: string, durationSeconds: number, completed: boolean) => Promise<void>;

  setView: (view: TaskView) => void;
  setActiveProject: (projectId: string | null) => void;
  setActiveTag: (tagId: string | null) => void;
  setSearch: (search: string) => void;
  setLastOutcome: (message: string | null) => void;
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
  },

  async addTaskFromInput(raw, overrides = {}) {
    const trimmed = raw.trim();
    if (!trimmed) return null;

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
  },

  async addTask(draft) {
    const created = await createTask(draft);
    await scheduleTaskNotifications(created).catch(() => undefined);
    await get().refreshTasks();
    return created;
  },

  async patchTask(id, patch) {
    const updated = await updateTaskRepo(id, patch);
    if (updated) {
      await scheduleTaskNotifications(updated).catch(() => undefined);
    }
    await get().refreshTasks();
  },

  async toggleTask(id) {
    const next = await toggleTaskComplete(id);
    if (next === 'done') {
      await cancelTaskNotifications(id).catch(() => undefined);
    } else {
      const task = get().tasks.find((t) => t.id === id);
      if (task) await scheduleTaskNotifications({ ...task, status: next }).catch(() => undefined);
    }
    await get().refreshTasks();
  },

  async removeTask(id) {
    await cancelTaskNotifications(id).catch(() => undefined);
    await softDeleteTask(id);
    await get().refreshTasks();
  },

  async breakDownTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return 0;

    const { steps } = await generateBreakdown(task);
    for (const step of steps) {
      await createTask({
        title: step.title,
        parentId: task.id,
        projectId: task.projectId,
        priority: task.priority,
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
  },

  async addProject(name, color) {
    await createProject({ name, color });
    set({ projects: await listProjects(true) });
  },

  async removeProject(id) {
    await deleteProject(id);
    await get().refresh();
  },

  async addHabit(name, color) {
    await createHabitRepo({ name, color });
    set({ habits: await listHabits(true) });
  },

  async toggleHabitToday(habitId) {
    await bumpHabitLog(habitId, toDateKey(), 1);
    set({ habitLogs: await listAllHabitLogs() });
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
