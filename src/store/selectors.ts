import {
  isBefore,
  isSameDay,
  isThisWeek,
  parseISO,
  startOfDay,
} from 'date-fns';

import type { TaskWithTags } from '@/domain/types';

/**
 * Pure derivations over the task list. Kept out of the store so they are cheap
 * to memoise in components and trivial to unit test.
 */

function dueDate(task: TaskWithTags): Date | null {
  if (!task.dueAt) return null;
  const parsed = parseISO(task.dueAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isOpen(task: TaskWithTags): boolean {
  return task.status !== 'done' && task.status !== 'archived';
}

export function isOverdue(task: TaskWithTags, now = new Date()): boolean {
  const due = dueDate(task);
  if (!due || !isOpen(task)) return false;
  return isBefore(due, startOfDay(now));
}

export function isDueToday(task: TaskWithTags, now = new Date()): boolean {
  const due = dueDate(task);
  return Boolean(due && isSameDay(due, now));
}

export function isDueThisWeek(task: TaskWithTags, now = new Date()): boolean {
  const due = dueDate(task);
  if (!due) return false;
  return isThisWeek(due, { weekStartsOn: 1 }) || isDueToday(task, now) || isOverdue(task, now);
}

export function sortByUrgency(tasks: TaskWithTags[]): TaskWithTags[] {
  const rank = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;
  return [...tasks].sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
    return a.position - b.position;
  });
}

/** Top-level tasks only — subtasks render inside their parent card. */
export function topLevel(tasks: TaskWithTags[]): TaskWithTags[] {
  return tasks.filter((task) => task.parentId === null);
}

export function applyFilters(
  tasks: TaskWithTags[],
  filters: { projectId: string | null; tagId: string | null; search: string },
): TaskWithTags[] {
  const query = filters.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.projectId && task.projectId !== filters.projectId) return false;
    if (filters.tagId && !task.tagIds.includes(filters.tagId)) return false;
    if (query) {
      const haystack = `${task.title} ${task.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function childrenOf(tasks: TaskWithTags[], parentId: string): TaskWithTags[] {
  return tasks.filter((task) => task.parentId === parentId);
}

export function subtaskProgress(
  tasks: TaskWithTags[],
  taskId: string,
): { done: number; total: number; ratio: number } {
  const children = childrenOf(tasks, taskId);
  const done = children.filter((child) => child.status === 'done').length;
  const total = children.length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

export interface DaySummary {
  openTasks: number;
  completedToday: number;
  overdue: number;
  focusMinutes: number;
  /** 0..1 — the dashboard progress ring. */
  completionRatio: number;
}

export function summarizeDay(
  tasks: TaskWithTags[],
  focusSecondsToday: number,
  now = new Date(),
): DaySummary {
  const dayStart = startOfDay(now).getTime();
  const dueToday = tasks.filter((task) => isDueToday(task, now) || isOverdue(task, now));
  const openTasks = dueToday.filter(isOpen).length;
  const completedToday = tasks.filter(
    (task) =>
      task.status === 'done' &&
      task.completedAt !== null &&
      new Date(task.completedAt).getTime() >= dayStart,
  ).length;

  return {
    openTasks,
    completedToday,
    overdue: tasks.filter((task) => isOverdue(task, now)).length,
    focusMinutes: Math.round(focusSecondsToday / 60),
    completionRatio: dueToday.length === 0 ? 0 : (dueToday.length - openTasks) / dueToday.length,
  };
}

/** Eisenhower quadrants for the priority matrix view. */
export function eisenhowerQuadrants(tasks: TaskWithTags[]): {
  urgentImportant: TaskWithTags[];
  notUrgentImportant: TaskWithTags[];
  urgentNotImportant: TaskWithTags[];
  neither: TaskWithTags[];
  unsorted: TaskWithTags[];
} {
  const open = tasks.filter(isOpen);
  const important = (task: TaskWithTags) => task.priority === 'high' || task.priority === 'urgent';
  const urgent = (task: TaskWithTags) => isOverdue(task) || isDueToday(task);

  return {
    urgentImportant: open.filter((task) => important(task) && urgent(task)),
    notUrgentImportant: open.filter((task) => important(task) && !urgent(task)),
    urgentNotImportant: open.filter((task) => !important(task) && urgent(task)),
    neither: open.filter((task) => !important(task) && !urgent(task)),
    unsorted: open.filter((task) => !task.dueAt && task.priority === 'none'),
  };
}
