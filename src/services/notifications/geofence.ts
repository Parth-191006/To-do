import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import type { TaskWithTags } from '@/domain/types';

/**
 * Location reminders ("remind me when I reach the office").
 *
 * expo-notifications has no geofence primitive, so we use expo-location's
 * background geofencing: the OS wakes the app when the device crosses a region
 * boundary, our TaskManager task runs headlessly, and it posts a local
 * notification. Region identifiers embed the task id so the handler can look
 * the right task back up.
 */

export const GEOFENCE_TASK = 'taskflow-geofence';

export interface GeofencePayload {
  taskId: string;
  title: string;
  trigger: 'enter' | 'leave';
  label: string;
}

const payloads = new Map<string, GeofencePayload>();

export function regionIdForTask(taskId: string): string {
  return `taskflow:${taskId}`;
}

export function taskIdFromRegion(identifier: string): string | null {
  const match = /^taskflow:(.+)$/.exec(identifier);
  return match ? match[1] : null;
}

// Must be defined in the global scope so the OS can invoke it after a cold
// start, without the React tree ever mounting.
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const event = data as
    | { eventType: Location.GeofencingEventType; region: Location.LocationRegion }
    | undefined;
  if (!event?.region) return;

  const taskId = taskIdFromRegion(event.region.identifier ?? '');
  const payload = taskId ? payloads.get(taskId) : undefined;
  const entering = event.eventType === Location.GeofencingEventType.Enter;
  const verb = entering ? 'You are at' : 'You left';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: payload?.title ?? 'Location reminder',
      body: payload ? `${verb} ${payload.label}` : 'You arrived at a saved place',
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      data: { taskId, kind: 'geofence' },
    },
    trigger: null, // deliver immediately
  });
});

export async function requestLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  // Geofencing keeps working in the background, which iOS grants separately.
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.granted;
}

/**
 * Registers (or replaces) the geofence for a task. We re-register the whole
 * set each time because expo-location replaces — not appends — regions.
 */
export async function syncGeofences(tasks: TaskWithTags[]): Promise<void> {
  const withLocation = tasks.filter((task) => task.locationReminder && task.status !== 'done');

  const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (isRegistered) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
  payloads.clear();

  if (withLocation.length === 0) return;

  const granted = await requestLocationPermissions();
  if (!granted) return;

  const regions: Location.LocationRegion[] = withLocation.map((task) => {
    const reminder = task.locationReminder!;
    payloads.set(task.id, {
      taskId: task.id,
      title: task.title,
      trigger: reminder.trigger,
      label: reminder.label,
    });
    return {
      identifier: regionIdForTask(task.id),
      latitude: reminder.latitude,
      longitude: reminder.longitude,
      radius: reminder.radius || 150,
      notifyOnEnter: reminder.trigger === 'enter',
      notifyOnExit: reminder.trigger === 'leave',
    };
  });

  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
}

export async function clearGeofences(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (isRegistered) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
  payloads.clear();
}

/** Convenience helper for turning an address into a reminder payload. */
export async function geocodePlace(query: string): Promise<Location.LocationGeocodedLocation | null> {
  const results = await Location.geocodeAsync(query);
  return results[0] ?? null;
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const results = await Location.reverseGeocodeAsync({ latitude, longitude });
  const first = results[0];
  if (!first) return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  return [first.name, first.street, first.city].filter(Boolean).join(', ');
}
