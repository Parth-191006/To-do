import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import type { TaskWithTags } from '@/domain/types';

import {
  createGeofenceSyncEngine,
  regionIdForTask,
  taskIdFromRegion,
  type GeofencePayload,
} from './geofenceSync';

/**
 * Location reminders ("remind me when I reach the office").
 *
 * expo-notifications has no geofence primitive, so we use expo-location's
 * background geofencing: the OS wakes the app when the device crosses a region
 * boundary, our TaskManager task runs headlessly, and it posts a local
 * notification. Region identifiers embed the task id so the handler can look
 * the right task back up.
 *
 * This file is the *native* half: it owns the OS calls and the payload map the
 * headless handler reads. All decisions — whether anything changed, what to
 * register, when to retry — live in `./geofenceSync`, which has no native
 * imports and is covered by `npm run verify:geofence`.
 */

// Kept re-exported from here so existing imports (and the notifications
// barrel) don't care where the pure logic moved.
export { regionIdForTask, taskIdFromRegion };
export type { GeofencePayload };

export const GEOFENCE_TASK = 'taskflow-geofence';

const payloads = new Map<string, GeofencePayload>();

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
 * The engine wires the pure gate to the OS. `stop` runs only when the
 * signature changed, clears the payload map unconditionally (matching the
 * old behaviour), and `start` refreshes the map the headless handler reads
 * before handing the regions to expo-location.
 */
const engine = createGeofenceSyncEngine({
  stop: async () => {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
    if (isRegistered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
    payloads.clear();
  },
  requestPermissions: requestLocationPermissions,
  start: async (plan) => {
    payloads.clear();
    for (const payload of plan.payloads) {
      payloads.set(payload.taskId, payload);
    }
    // RegionInput is structurally identical to Location.LocationRegion.
    await Location.startGeofencingAsync(GEOFENCE_TASK, plan.regions);
  },
});

/**
 * Reconciles the OS geofences with the current task list.
 *
 * Signature-gated and queued inside the engine, so it is safe to call after
 * every task mutation (that is exactly what the store does) — no-op when
 * nothing about the fences changed, retry on the next call when permission
 * was missing or registration failed.
 */
export function syncGeofences(tasks: TaskWithTags[]): Promise<void> {
  return engine.sync(tasks);
}

export async function clearGeofences(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_TASK);
  if (isRegistered) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
  payloads.clear();
  // The OS holds nothing now — forget the recorded signature so the next sync
  // with the same tasks re-arms instead of being skipped as "already synced".
  engine.reset();
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
