import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Actionable notification setup.
 *
 * TaskFlow notifications carry inline actions so a task can be completed or
 * snoozed straight from the banner — the app never has to open. We register
 * one category per intent so the buttons stay contextual and short.
 */

export const CATEGORY_TASK = 'taskflow.task';
export const CATEGORY_HABIT = 'taskflow.habit';
export const CATEGORY_FOCUS = 'taskflow.focus';

export const ACTION_COMPLETE = 'TASKFLOW_COMPLETE';
export const ACTION_SNOOZE_5 = 'TASKFLOW_SNOOZE_5';
export const ACTION_SNOOZE_60 = 'TASKFLOW_SNOOZE_60';
export const ACTION_SNOOZE_TOMORROW = 'TASKFLOW_SNOOZE_TOMORROW';
export const ACTION_OPEN = 'TASKFLOW_OPEN';
export const ACTION_START_FOCUS = 'TASKFLOW_START_FOCUS';

/**
 * Foreground presentation. `shouldPlaySound: false` would suppress the
 * heads-up banner on Android entirely, so sound stays on.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(CATEGORY_TASK, [
    {
      identifier: ACTION_COMPLETE,
      buttonTitle: 'Complete',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_SNOOZE_5,
      buttonTitle: 'Snooze 5m',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_SNOOZE_60,
      buttonTitle: 'Snooze 1h',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_SNOOZE_TOMORROW,
      buttonTitle: 'Tomorrow',
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_OPEN,
      buttonTitle: 'Open',
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(CATEGORY_HABIT, [
    {
      identifier: ACTION_COMPLETE,
      buttonTitle: 'Done',
      options: { opensAppToForeground: false },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(CATEGORY_FOCUS, [
    {
      identifier: ACTION_START_FOCUS,
      buttonTitle: 'Start focus',
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTION_SNOOZE_5,
      buttonTitle: 'Snooze 5m',
      options: { opensAppToForeground: false },
    },
  ]);
}

/** Android channels — one per urgency tier so users can tune them in Settings. */
export async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('taskflow-default', {
    name: 'Task reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Standard task and project reminders.',
    vibrationPattern: [0, 200, 100, 200],
    lightColor: '#6C5CE7',
  });

  // Urgent tasks bypass Do Not Disturb where the OS permission allows it.
  await Notifications.setNotificationChannelAsync('taskflow-urgent', {
    name: 'Urgent reminders',
    importance: Notifications.AndroidImportance.MAX,
    bypassDnd: true,
    description: 'Critical task alerts that break through Do Not Disturb.',
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#F43F5E',
  });

  await Notifications.setNotificationChannelAsync('taskflow-focus', {
    name: 'Focus timer',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Pomodoro start and end alerts.',
    vibrationPattern: [0, 150, 80, 150],
    lightColor: '#10B981',
  });

  await Notifications.setNotificationChannelAsync('taskflow-habits', {
    name: 'Habit nudges',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Daily habit reminders and streak alerts.',
    vibrationPattern: [0, 120],
    lightColor: '#0EA5E9',
  });
}
