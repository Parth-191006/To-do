import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  DEFAULT_CHANNEL,
  HIGH_CHANNEL,
  HIGH_DND_CHANNEL,
  setDndBypassPreference,
} from './channelPrefs';

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
      // "Start focus" belongs on a task's banner as much as on the timer's:
      // it is the action you want when a reminder lands mid-queue.
      identifier: ACTION_START_FOCUS,
      buttonTitle: 'Start focus',
      options: { opensAppToForeground: true },
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

/**
 * Android channels — one per urgency tier so users can tune them in Settings.
 *
 * `bypassDnd` is a *creation-time* flag: Android ignores it on every later call
 * for the same channel id, which is why the opt-in tier is a separate channel
 * (`HIGH_DND_CHANNEL`) rather than a property of `HIGH_CHANNEL`. When the
 * preference is off — the default — that channel is never created at all.
 */
export async function configureNotificationChannels(
  options: { dndBypass?: boolean } = {},
): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL, {
    name: 'Task reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Standard task and project reminders.',
    vibrationPattern: [0, 200, 100, 200],
    lightColor: '#0D9488',
  });

  // High and urgent tasks get a heads-up banner, but respect Do Not Disturb.
  await Notifications.setNotificationChannelAsync(HIGH_CHANNEL, {
    name: 'High-priority reminders',
    importance: Notifications.AndroidImportance.MAX,
    bypassDnd: false,
    description: 'Heads-up alerts for high and urgent tasks. Respects Do Not Disturb.',
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#F43F5E',
  });

  // Only while the user has asked for it in Settings → Notifications.
  if (options.dndBypass) {
    await Notifications.setNotificationChannelAsync(HIGH_DND_CHANNEL, {
      name: 'Urgent reminders (breaks through DND)',
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      description:
        'High and urgent task alerts that break through Do Not Disturb. Turned on in TaskFlow settings.',
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#F43F5E',
    });
  }

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

/**
 * Applies the user's Do Not Disturb choice.
 *
 * Called on boot (the preference is restored from disk) and from the Settings
 * switch. Reminders already scheduled keep the channel they were armed with —
 * onChangeVisibleNotificationChannel is not a thing Android offers — so the
 * Settings copy says the change applies to reminders armed from here on, and
 * the screen re-arms them straight away.
 */
export async function applyDndBypassPreference(enabled: boolean): Promise<void> {
  setDndBypassPreference(enabled);
  if (Platform.OS !== 'android') return;
  await configureNotificationChannels({ dndBypass: enabled }).catch(() => undefined);
}
