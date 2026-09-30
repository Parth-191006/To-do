import * as Notifications from 'expo-notifications';

import { getTask, toggleTaskComplete } from '@/db/repositories/tasks';
import { bumpHabitLog } from '@/db/repositories/habits';
import { toDateKey } from '@/utils/id';

import {
  ACTION_COMPLETE,
  ACTION_OPEN,
  ACTION_SNOOZE_5,
  ACTION_SNOOZE_60,
  ACTION_SNOOZE_TOMORROW,
  ACTION_START_FOCUS,
} from './categories';
import { snoozeTask } from './scheduler';

/**
 * Turns an actionable notification tap into a domain mutation.
 *
 * Runs from the response listener and from the headless background task, so it
 * must never assume React state exists — it talks to repositories directly and
 * reports back what changed so the UI can refresh.
 */

export interface NotificationOutcome {
  taskId?: string;
  habitId?: string;
  action: string;
  message: string;
  /** In-app route the tap should navigate to, e.g. `/task/task_123`. */
  url?: string;
}

function readData(response: Notifications.NotificationResponse): Record<string, unknown> {
  return (response.notification.request.content.data ?? {}) as Record<string, unknown>;
}

export async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<NotificationOutcome | null> {
  const action = response.actionIdentifier;
  const data = readData(response);
  const taskId = typeof data.taskId === 'string' ? data.taskId : undefined;
  const habitId = typeof data.habitId === 'string' ? data.habitId : undefined;

  if (habitId && action === ACTION_COMPLETE) {
    const count = await bumpHabitLog(habitId, toDateKey(), 1);
    return { habitId, action, message: count > 0 ? 'Habit logged' : 'Habit updated' };
  }

  const url = typeof data.url === 'string' ? data.url : undefined;

  if (!taskId) {
    // Digest / test / focus alerts carry only a route. Tapping the banner used
    // to do absolutely nothing for these.
    return url ? { action: 'open', message: 'Opened from notification', url } : null;
  }

  if (action === ACTION_START_FOCUS) {
    return { taskId, action, message: 'Opening the focus timer', url: '/focus' };
  }

  const task = await getTask(taskId);
  if (!task) return { taskId, action, message: 'Task no longer exists', url };

  switch (action) {
    case ACTION_COMPLETE: {
      await toggleTaskComplete(taskId);
      const { cancelTaskNotifications } = await import('./scheduler');
      await cancelTaskNotifications(taskId);
      return { taskId, action, message: `Completed “${task.title}”` };
    }
    case ACTION_SNOOZE_5: {
      await snoozeTask(taskId, { minutes: 5, body: task.title, title: 'Snoozed 5 minutes' });
      return { taskId, action, message: 'Snoozed for 5 minutes' };
    }
    case ACTION_SNOOZE_60: {
      await snoozeTask(taskId, { minutes: 60, body: task.title, title: 'Snoozed 1 hour' });
      return { taskId, action, message: 'Snoozed for an hour' };
    }
    case ACTION_SNOOZE_TOMORROW: {
      await snoozeTask(taskId, {
        body: task.title,
        title: 'Snoozed until tomorrow',
        toTomorrowAt: 9,
      });
      return { taskId, action, message: 'Snoozed until tomorrow at 9am' };
    }
    case ACTION_OPEN:
    case Notifications.DEFAULT_ACTION_IDENTIFIER:
      return {
        taskId,
        action: 'open',
        message: `Opened “${task.title}”`,
        url: url ?? `/task/${taskId}`,
      };
    default:
      return null;
  }
}

/**
 * Drains the tap that launched the app from cold.
 *
 * `addNotificationResponseReceivedListener` only fires for taps that happen
 * while the process is alive, so a notification that started the app looked
 * like it did nothing at all.
 */
export async function consumeInitialNotificationResponse(): Promise<NotificationOutcome | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  return handleNotificationResponse(response).catch(() => null);
}

/** Subscribes to taps and dismissals. Returns an unsubscribe function. */
export function subscribeToNotificationResponses(
  onOutcome: (outcome: NotificationOutcome) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    void handleNotificationResponse(response)
      .then((outcome) => {
        if (outcome) onOutcome(outcome);
      })
      .catch(() => undefined);
  });
  return () => subscription.remove();
}
