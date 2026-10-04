/**
 * TaskFlow domain model.
 *
 * These types are the single source of truth shared by the SQLite layer,
 * the sync engine and the UI. Every record carries `updatedAt` + `syncState`
 * so the offline-first outbox can reconcile with Supabase using a
 * last-write-wins strategy (see src/services/sync/engine.ts).
 */

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type SyncState = 'synced' | 'pending' | 'conflict';

export interface Recurrence {
  frequency: RecurrenceFrequency;
  /** Repeat every N periods (e.g. interval 2 + weekly = every 2 weeks). */
  interval: number;
  /** 0 = Sunday … 6 = Saturday. Only meaningful for weekly recurrences. */
  byWeekday?: number[];
  /** Inclusive ISO timestamp after which the recurrence stops. */
  until?: string | null;
}

export interface LocationReminder {
  latitude: number;
  longitude: number;
  /** Geofence radius in metres. Defaults to 150. */
  radius: number;
  trigger: 'enter' | 'leave';
  label: string;
}

export interface Attachment {
  id: string;
  kind: 'image' | 'audio' | 'file';
  uri: string;
  name?: string;
  /** Duration for audio notes, in milliseconds. */
  durationMs?: number;
  createdAt: string;
}

/** Matches an entity in the database to its Supabase table. */
export type EntityKind =
  | 'task'
  | 'project'
  | 'tag'
  | 'habit'
  | 'habit_log'
  | 'focus_session';

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  icon: string;
  isArchived: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
}

export interface Task {
  id: string;
  projectId: string | null;
  /** Parent task id — enables infinite subtask nesting. */
  parentId: string | null;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  dueAt: string | null;
  remindAt: string | null;
  recurrence: Recurrence | null;
  locationReminder: LocationReminder | null;
  estimateMinutes: number | null;
  attachments: Attachment[];
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncState: SyncState;
}

/** Task joined with its tag ids, as returned by the repository. */
export interface TaskWithTags extends Task {
  tagIds: string[];
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** How many times the habit should be completed per period. */
  targetPerPeriod: number;
  cadence: 'daily' | 'weekly';
  /** 0 = Sunday … 6 = Saturday. Empty = every day. */
  byWeekday: number[];
  /** Local-time daily nudge (24h clock); null when the habit has no reminder. */
  reminderHour: number | null;
  reminderMinute: number | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  syncState: SyncState;
}

export interface HabitLog {
  id: string;
  habitId: string;
  /** Local calendar day, `YYYY-MM-DD`, so streaks survive timezone changes. */
  dateKey: string;
  count: number;
  createdAt: string;
  syncState: SyncState;
}

export interface FocusSession {
  id: string;
  taskId: string | null;
  projectId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  kind: 'focus' | 'break';
  completed: boolean;
  syncState: SyncState;
}

export type NotificationKind =
  | 'task_due'
  | 'task_reminder'
  | 'recurring'
  | 'geofence'
  | 'habit'
  | 'focus'
  | 'digest';

export type NotificationStatus = 'scheduled' | 'delivered' | 'cancelled' | 'failed';

/**
 * A mirror of what we asked the OS to schedule. Keeping our own record lets us
 * cancel/reschedule deterministically and survive app restarts.
 */
export interface ScheduledNotification {
  id: string;
  /** OS-level identifier returned by expo-notifications. */
  osIdentifier: string | null;
  taskId: string | null;
  habitId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  triggerAt: string | null;
  recurrence: Recurrence | null;
  status: NotificationStatus;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  actorId: string;
  action: string;
  summary: string;
  createdAt: string;
}

export interface SharedListMember {
  id: string;
  projectId: string;
  userId: string;
  displayName: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

/** Result of parsing a natural-language task string. */
export interface ParsedTask {
  /** The cleaned title with all recognised fragments removed. */
  title: string;
  dueAt: string | null;
  remindAt: string | null;
  priority: Priority;
  tags: string[];
  projectHint: string | null;
  recurrence: Recurrence | null;
  estimateMinutes: number | null;
  /** Recognised fragments with their character spans, for inline highlighting. */
  tokens: ParsedToken[];
}

export interface ParsedToken {
  kind:
    | 'date'
    | 'time'
    | 'priority'
    | 'tag'
    | 'project'
    | 'recurrence'
    | 'estimate'
    | 'location';
  text: string;
  start: number;
  end: number;
  /** Human-readable resolved value shown in the preview chip. */
  label: string;
}

export type TaskView = 'list' | 'kanban' | 'calendar' | 'matrix';
