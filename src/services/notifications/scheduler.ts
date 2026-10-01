import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Habit, Priority, Recurrence, TaskWithTags } from '@/domain/types';
import {
  cancelNotificationsForTask,
  recordNotification,
  updateNotificationStatus,
} from '@/db/repositories/notifications';
import { describeRecurrence } from '@/nlp/parser';

import {
  ACTION_COMPLETE,
  ACTION_SNOOZE_5,
  ACTION_SNOOZE_60,
  ACTION_SNOOZE_TOMORROW,
  CATEGORY_FOCUS,
  CATEGORY_HABIT,
  CATEGORY_TASK,
  configureNotificationChannels,
  registerNotificationCategories,
} from './categories';

/**
 * Local Notification Scheduling Service.
 *
 * Responsibilities
 * ----------------
 * 1. Own the mapping between a `Task`/`Habit` and the notifications the OS
 *    should fire, including recurrence resolution.
 * 2. Mirror every scheduled request into `notification_records` so the app can
 *    cancel or reschedule deterministically after a cold start.
 * 3. Route urgency: high/urgent tasks get the DND-bypassing Android channel and
 *    iOS `timeSensitive` / `critical` interruption levels.
 * 4. Provide snooze primitives used by the actionable notification buttons.
 */

const CHANNEL_BY_PRIORITY: Record<Priority, string> = {
  none: 'taskflow-default',
  low: 'taskflow-default',
  medium: 'taskflow-default',
  high: 'taskflow-urgent',
  urgent: 'taskflow-urgent',
};

const MINUTE = 60_000;

/**
 * Android silently drops a notification scheduled against a channel that does
 * not exist yet, so every scheduling entry point makes sure its channels are
 * registered first. Cheap and idempotent. The first call after a cold start may
 * run before `configureNotifications()` settles, which is exactly the race this
 * closes.
 */
async function readyChannels(): Promise<void> {
  // Channels must exist or Android silently drops the post; categories must
  // exist or the banner arrives with no action buttons ("options"). Both are
  // cheap and idempotent, so we re-assert them right before every schedule
  // rather than trusting that the cold-start boot sequence finished first.
  await configureNotificationChannels().catch(() => undefined);
  await registerNotificationCategories().catch(() => undefined);
}

export interface ScheduleResult {
  scheduled: number;
  skippedReason?: string;
}

/** Ensures we are allowed to post notifications, asking once if needed. */
export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  // Once the OS has recorded a denial (Android 13+ reports `status: 'denied'`
  // while still allowing one more prompt), re-asking in a loop is what made the
  // permission feel broken. We ask once from 'undetermined' and otherwise defer
  // to the Settings screen, which can deep-link into the system app settings.
  if (current.status === 'denied' || !current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      // `criticalAlert` requires a special Apple entitlement; time-sensitive
      // is the portable way to break through Focus modes.
      allowProvisional: false,
    },
  });
  return next.granted;
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (current.status === 'denied' || !current.canAskAgain) return 'denied';
  return 'undetermined';
}

/**
 * Builds the OS trigger for a one-off or recurring reminder.
 * Returns null when the target time is already in the past — we never schedule
 * a notification the user has no chance to see.
 */
export function buildTrigger(
  date: Date,
  recurrence: Recurrence | null,
  channelId: string,
): Notifications.NotificationTriggerInput | null {
  if (recurrence) {
    const hour = date.getHours();
    const minute = date.getMinutes();
    switch (recurrence.frequency) {
      case 'daily':
        return { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId };
      case 'weekly':
        return {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          // expo uses 1 = Sunday … 7 = Saturday.
          weekday: date.getDay() + 1,
          hour,
          minute,
          channelId,
        };
      case 'monthly':
        return {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day: date.getDate(),
          hour,
          minute,
          channelId,
        };
      case 'yearly':
        return {
          type: Notifications.SchedulableTriggerInputTypes.YEARLY,
          month: date.getMonth(),
          day: date.getDate(),
          hour,
          minute,
          channelId,
        };
      default:
        return null;
    }
  }

  if (date.getTime() <= Date.now()) return null;
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId };
}

function interruptionLevel(priority: Priority): 'active' | 'timeSensitive' {
  return priority === 'high' || priority === 'urgent' ? 'timeSensitive' : 'active';
}

function priorityOrder(priority: Priority): string {
  switch (priority) {
    case 'urgent':
      return 'max';
    case 'high':
      return 'high';
    default:
      return 'default';
  }
}

/**
 * Schedules every reminder a task needs:
 *   - the "heads up" reminder at `remindAt`
 *   - the due-time alert at `dueAt`
 * Recurrence is carried onto both so repeating tasks reschedule themselves.
 */
export async function scheduleTaskNotifications(task: TaskWithTags): Promise<ScheduleResult> {
  if (task.status === 'done' || task.status === 'archived') {
    await cancelTaskNotifications(task.id);
    return { scheduled: 0, skippedReason: 'Task is already complete' };
  }

  await cancelTaskNotifications(task.id);

  const allowed = await ensureNotificationPermissions();
  if (!allowed) return { scheduled: 0, skippedReason: 'Notification permission not granted' };

  await readyChannels();

  const channelId = CHANNEL_BY_PRIORITY[task.priority];
  const plans: { at: Date; title: string; body: string; kind: 'task_reminder' | 'task_due' }[] = [];

  if (task.remindAt) {
    plans.push({
      at: new Date(task.remindAt),
      title: 'Upcoming task',
      body: task.title,
      kind: 'task_reminder',
    });
  }
  if (task.dueAt) {
    plans.push({
      at: new Date(task.dueAt),
      title: task.priority === 'urgent' ? 'Urgent — task due' : 'Task due now',
      body: task.recurrence
        ? `${task.title} · repeats ${describeRecurrence(task.recurrence)}`
        : task.title,
      kind: 'task_due',
    });
  }
  if (plans.length === 0) {
    return { scheduled: 0, skippedReason: 'Task has no date or time set' };
  }

  let scheduled = 0;
  for (const plan of plans) {
    const trigger = buildTrigger(plan.at, task.recurrence, channelId);
    if (!trigger) continue;

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: plan.title,
        body: plan.body,
        categoryIdentifier: CATEGORY_TASK,
        sound: 'default',
        color: channelId === 'taskflow-urgent' ? '#F43F5E' : '#6C5CE7',
        priority: priorityOrder(task.priority),
        interruptionLevel: interruptionLevel(task.priority),
        data: {
          taskId: task.id,
          projectId: task.projectId,
          kind: plan.kind,
          url: `/task/${task.id}`,
        },
      },
      trigger,
    });

    await recordNotification({
      osIdentifier: identifier,
      taskId: task.id,
      kind: plan.kind,
      title: plan.title,
      body: plan.body,
      triggerAt: plan.at.toISOString(),
      recurrence: task.recurrence,
    });
    scheduled += 1;
  }

  return { scheduled };
}

export async function cancelTaskNotifications(taskId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    const data = request.content.data as { taskId?: string } | undefined;
    if (data?.taskId === taskId) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }
  await cancelNotificationsForTask(taskId);
}

/** Snooze primitive used by the actionable notification buttons. */
export async function snoozeTask(
  taskId: string,
  options: { minutes?: number; body: string; title?: string; toTomorrowAt?: number },
): Promise<string> {
  const allowed = await ensureNotificationPermissions();
  const when = options.toTomorrowAt
    ? tomorrowAt(options.toTomorrowAt)
    : new Date(Date.now() + (options.minutes ?? 5) * MINUTE);

  if (!allowed) return 'permission-denied';

  await readyChannels();

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: options.title ?? 'Snoozed reminder',
      body: options.body,
      categoryIdentifier: CATEGORY_TASK,
      sound: 'default',
      data: { taskId, kind: 'task_reminder' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: 'taskflow-default',
    },
  });

  await recordNotification({
    osIdentifier: identifier,
    taskId,
    kind: 'task_reminder',
    title: options.title ?? 'Snoozed reminder',
    body: options.body,
    triggerAt: when.toISOString(),
  });

  return identifier;
}

function tomorrowAt(hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date;
}

export async function scheduleHabitReminder(
  habit: Habit,
  at: { hour: number; minute: number },
): Promise<void> {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return;

  await readyChannels();

  const channelId = Platform.OS === 'android' ? 'taskflow-habits' : undefined;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Habit check-in',
      body: `Keep your streak alive — ${habit.name}`,
      categoryIdentifier: CATEGORY_HABIT,
      sound: 'default',
      data: { habitId: habit.id, kind: 'habit', url: '/habits' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: at.hour,
      minute: at.minute,
      channelId,
    },
  });
}

export async function cancelHabitReminders(habitId: string): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    const data = request.content.data as { habitId?: string } | undefined;
    if (data?.habitId === habitId) {
      await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
  }
}

/**
 * Fires when a Pomodoro block ends. Returns the OS identifier so the timer can
 * pull the pending alert when the block is paused, reset or skipped — otherwise
 * pausing and resuming leaves a stale "block complete" banner behind.
 */
export async function scheduleFocusEnd(
  at: Date,
  taskId: string | null,
  label: string,
): Promise<string | null> {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return null;
  await readyChannels();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Focus block complete',
      body: label,
      categoryIdentifier: CATEGORY_FOCUS,
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      data: { taskId, kind: 'focus', url: '/focus' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: Platform.OS === 'android' ? 'taskflow-focus' : undefined,
    },
  });
}

/** Pulls a single scheduled notification, ignoring "already gone" errors. */
export async function cancelScheduled(identifier: string | null): Promise<void> {
  if (!identifier) return;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
}

/** Daily digest slot — a single "here is your day" nudge. */
export async function scheduleDailyDigest(at: { hour: number; minute: number }): Promise<void> {
  const allowed = await ensureNotificationPermissions();
  if (!allowed) return;
  await readyChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your day in TaskFlow',
      body: 'Open TaskFlow to see what is due today.',
      sound: 'default',
      data: { kind: 'digest' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: at.hour,
      minute: at.minute,
    },
  });
}

export async function dismissAll(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}

/**
 * Fires a real notification a few seconds out so the user can verify that the
 * permission, the channel and the OS all actually work — end to end, on their
 * own device, without waiting for a task to fall due.
 */
export async function sendTestNotification(
  delaySeconds = 4,
): Promise<{ ok: boolean; reason?: string }> {
  const current = await Notifications.getPermissionsAsync();
  const allowed = current.granted ? true : await ensureNotificationPermissions();
  if (!allowed) return { ok: false, reason: 'Notification permission is off' };

  await readyChannels();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'TaskFlow notifications are working',
      body: 'This is exactly how your reminders will look.',
      sound: 'default',
      categoryIdentifier: CATEGORY_TASK,
      color: '#6C5CE7',
      data: { kind: 'test', url: '/' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, delaySeconds),
      channelId: Platform.OS === 'android' ? 'taskflow-default' : undefined,
    },
  });
  return { ok: true };
}

/** Wipes every scheduled notification — used by "reset my data". */
export async function cancelAllScheduled(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const request of scheduled) {
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
    await updateNotificationStatus(request.identifier, 'cancelled');
  }
}

export const TASK_ACTIONS = {
  complete: ACTION_COMPLETE,
  snooze5: ACTION_SNOOZE_5,
  snooze60: ACTION_SNOOZE_60,
  snoozeTomorrow: ACTION_SNOOZE_TOMORROW,
} as const;
