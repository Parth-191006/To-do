/**
 * Pure decision logic behind the geofence "re-arm" pipeline.
 *
 * This module has **no native imports** on purpose: `expo-location`,
 * `expo-task-manager` and `expo-notifications` cannot be loaded by Node, so
 * everything that decides *whether* and *what* to register lives here where
 * `npm run verify:geofence` can execute it directly. `./geofence.ts` is only
 * the thin native wrapper that wires these deps to the OS.
 *
 * Why a signature gate at all
 * ---------------------------
 * `syncGeofences` used to run only from `bootstrap()`, so a place reminder
 * added in the editor stayed dark until the next cold start. The fix is to
 * call it after *every* task mutation — which is only affordable (and only
 * safe with the OS) if we can tell when the effective region set actually
 * changed. The signature answers exactly that: a canonical string of the set
 * of fences the OS should be holding right now.
 *
 * Recording rules (the regression-prone part):
 *  - the signature is recorded **only after we reached the desired end state**
 *    (fences cleared for an empty set, `start` resolved for a non-empty one);
 *  - a denied permission or a throwing `start` leaves the signature stale, so
 *    the next call retries instead of believing the fences are armed;
 *  - `reset()` forgets everything (used by `clearGeofences`), so identical
 *    input re-arms after the OS state was wiped behind our back.
 */

import type { TaskWithTags } from '@/domain/types';

/** What the headless TaskManager handler needs to build the banner text. */
export interface GeofencePayload {
  taskId: string;
  title: string;
  trigger: 'enter' | 'leave';
  label: string;
}

/** One region as handed to `Location.startGeofencingAsync`. */
export interface RegionInput {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

export interface GeofencePlan {
  regions: RegionInput[];
  payloads: GeofencePayload[];
}

/** Region identifiers embed the task id so the handler can look it back up. */
export function regionIdForTask(taskId: string): string {
  return `taskflow:${taskId}`;
}

export function taskIdFromRegion(identifier: string): string | null {
  const match = /^taskflow:(.+)$/.exec(identifier);
  return match ? match[1] : null;
}

/**
 * Tasks that should hold an active fence right now.
 *
 * Mirrors `isOpen` semantics from `@/store/selectors` (inlined, not imported:
 * this module must stay free of runtime imports so Node can execute it): a
 * finished *or* archived task must never fire a place alert. The old filter
 * only excluded `done`, so archiving a task left its geofence armed — the
 * regression suite pins this down.
 */
export function activeGeofenceTasks(tasks: TaskWithTags[]): TaskWithTags[] {
  return tasks.filter(
    (task) =>
      task.locationReminder &&
      task.status !== 'done' &&
      task.status !== 'archived',
  );
}

/**
 * Canonical string of the effective region set.
 *
 * Includes every field a registered region or its banner depends on — id,
 * trigger direction, coordinates, radius, label and task title — and is
 * sorted, so reordering the task list is a no-op while editing any fence
 * content (or completing a fenced task) changes it.
 */
export function signatureForTasks(tasks: TaskWithTags[]): string {
  return activeGeofenceTasks(tasks)
    .map((task) => {
      const reminder = task.locationReminder!;
      return [
        task.id,
        reminder.trigger,
        reminder.latitude,
        reminder.longitude,
        reminder.radius || 150,
        reminder.label,
        task.title,
      ].join(':');
    })
    .sort()
    .join('|');
}

/** Turns the current task list into the exact regions + payloads to register. */
export function buildGeofencePlan(tasks: TaskWithTags[]): GeofencePlan {
  const regions: RegionInput[] = [];
  const payloads: GeofencePayload[] = [];

  for (const task of activeGeofenceTasks(tasks)) {
    const reminder = task.locationReminder!;
    regions.push({
      identifier: regionIdForTask(task.id),
      latitude: reminder.latitude,
      longitude: reminder.longitude,
      radius: reminder.radius || 150,
      notifyOnEnter: reminder.trigger === 'enter',
      notifyOnExit: reminder.trigger === 'leave',
    });
    payloads.push({
      taskId: task.id,
      title: task.title,
      trigger: reminder.trigger,
      label: reminder.label,
    });
  }

  return { regions, payloads };
}

/** Side effects the engine may perform, injected so tests can fake the OS. */
export interface GeofenceSyncDeps {
  /** Clear whatever the OS currently holds (and any cached payloads). */
  stop(): Promise<void>;
  /** Ask for foreground+background location; resolves whether we may register. */
  requestPermissions(): Promise<boolean>;
  /** Register the whole region set (the API replaces, never appends). */
  start(plan: GeofencePlan): Promise<void>;
}

export interface GeofenceSyncEngine {
  /** Reconciles the OS with `tasks`. Never rejects; overlapping calls queue. */
  sync(tasks: TaskWithTags[]): Promise<void>;
  /** Forgets the recorded signature (OS state was cleared elsewhere). */
  reset(): void;
}

export function createGeofenceSyncEngine(deps: GeofenceSyncDeps): GeofenceSyncEngine {
  let lastSyncedSignature: string | null = null;
  let chain: Promise<void> = Promise.resolve();

  async function apply(tasks: TaskWithTags[]): Promise<void> {
    const signature = signatureForTasks(tasks);
    if (signature === lastSyncedSignature) return;

    // Whole-set replace: clear the OS first, then decide what to arm.
    await deps.stop();

    if (activeGeofenceTasks(tasks).length === 0) {
      // Desired state reached: nothing should be registered.
      lastSyncedSignature = signature;
      return;
    }

    const granted = await deps.requestPermissions();
    // Deliberately NOT recorded: with permission missing the fences are not
    // armed, so the signature must stay stale and the next call retries.
    if (!granted) return;

    await deps.start(buildGeofencePlan(tasks));
    lastSyncedSignature = signature;
  }

  function sync(tasks: TaskWithTags[]): Promise<void> {
    // Serialize: rapid mutations queue instead of interleaving stop/start.
    // Swallow failures so a native hiccup never surfaces as an unhandled
    // rejection — and, per `apply`, an incomplete sync retries naturally.
    const next = chain.then(() => apply(tasks)).catch(() => undefined);
    chain = next;
    return next;
  }

  function reset(): void {
    lastSyncedSignature = null;
  }

  return { sync, reset };
}
