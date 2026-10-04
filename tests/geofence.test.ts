/**
 * Geofence re-arm suite (15 assertions, ported from `scripts/verify-geofence.ts`).
 *
 * Place reminders used to arm only at cold start; the fix was to sync after
 * every mutation, which is only safe with the signature gate exercised here.
 * The module under test has no native imports, so the OS is faked through the
 * injected deps and every side effect is an entry in an `ops` log.
 */
import { describe, expect, it } from 'vitest';

import type { LocationReminder, TaskStatus, TaskWithTags } from '@/domain/types';
import {
  buildGeofencePlan,
  createGeofenceSyncEngine,
  regionIdForTask,
  signatureForTasks,
  taskIdFromRegion,
  type GeofencePlan,
  type GeofenceSyncDeps,
} from '@/services/notifications/geofenceSync';

function task(id: string, overrides: Partial<TaskWithTags> = {}): TaskWithTags {
  return {
    id,
    projectId: null,
    parentId: null,
    title: `Task ${id}`,
    notes: '',
    status: 'todo' satisfies TaskStatus,
    priority: 'none',
    dueAt: null,
    remindAt: null,
    recurrence: null,
    locationReminder: null,
    estimateMinutes: null,
    attachments: [],
    position: 1,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    syncState: 'pending',
    tagIds: [],
    ...overrides,
  };
}

function place(
  id: string,
  reminder: Partial<LocationReminder> = {},
  overrides: Partial<TaskWithTags> = {},
): TaskWithTags {
  return task(id, {
    ...overrides,
    locationReminder: {
      latitude: 51.5007,
      longitude: -0.1246,
      radius: 150,
      trigger: 'enter',
      label: 'Office',
      ...reminder,
    },
  });
}

/** Fake OS: every side effect lands in `ops`; failures are scripted. */
function harness(initialGrant = true) {
  const ops: string[] = [];
  const starts: GeofencePlan[] = [];
  const grant = { value: initialGrant };
  const failStart = { value: false };

  const deps: GeofenceSyncDeps = {
    stop: async () => {
      ops.push('stop');
    },
    requestPermissions: async () => {
      ops.push('permission');
      return grant.value;
    },
    start: async (plan) => {
      ops.push(`start(${plan.regions.map((region) => region.identifier).join('+')})`);
      if (failStart.value) throw new Error('startGeofencingAsync blew up');
      starts.push(plan);
    },
  };

  return { ops, starts, grant, failStart, deps };
}

const OS = 'taskflow:p';

describe('geofence signatures and plans', () => {
  it('tasks without a place (or already done) share one empty signature', () => {
    expect(signatureForTasks([])).toBe('');
    expect(signatureForTasks([task('a')])).toBe('');
    expect(signatureForTasks([place('p', {}, { status: 'done' })])).toBe('');
    expect(signatureForTasks([place('p', {}, { status: 'archived' })])).toBe('');
  });

  it('the signature reacts to every field a fence is built from', () => {
    const base = place('p');
    const original = signatureForTasks([base]);

    expect(signatureForTasks([base, place('q')])).not.toBe(original);
    expect(signatureForTasks([place('p', { latitude: 51.6 })])).not.toBe(original);
    expect(signatureForTasks([place('p', { longitude: 0.1 })])).not.toBe(original);
    expect(signatureForTasks([place('p', { radius: 300 })])).not.toBe(original);
    expect(signatureForTasks([place('p', { trigger: 'leave' })])).not.toBe(original);
    expect(signatureForTasks([place('p', { label: 'Home' })])).not.toBe(original);
    expect(signatureForTasks([place('p', {}, { title: 'Renamed task' })])).not.toBe(original);
    expect(signatureForTasks([place('p', {}, { status: 'done' })])).not.toBe(original);
  });

  it('rebuilt identical input and reordering are signature-stable', () => {
    const a = place('a');
    const b = place('b');
    expect(signatureForTasks([a])).toBe(signatureForTasks([place('a')]));
    expect(signatureForTasks([a, b])).toBe(signatureForTasks([b, a]));
    expect(signatureForTasks([a, b])).toBe(signatureForTasks([b, a, task('plain')]));
  });

  it('region ids round-trip the task id and reject foreign regions', () => {
    expect(regionIdForTask('task_7')).toBe('taskflow:task_7');
    expect(taskIdFromRegion('taskflow:task_7')).toBe('task_7');
    expect(taskIdFromRegion('other:task_7')).toBeNull();
    expect(taskIdFromRegion('taskflow:')).toBeNull();
    expect(taskIdFromRegion('')).toBeNull();
  });

  it('the plan maps reminders to OS regions with a 150 m default radius', () => {
    const plan = buildGeofencePlan([
      place('p', { radius: 0, trigger: 'enter' }),
      place('q', { latitude: 40.7, longitude: -74.0, radius: 250, trigger: 'leave' }),
    ]);

    expect(plan.regions).toHaveLength(2);
    const [entering, leaving] = plan.regions;
    expect(entering.identifier).toBe('taskflow:p');
    expect(entering.radius).toBe(150);
    expect(entering.notifyOnEnter).toBe(true);
    expect(entering.notifyOnExit).toBe(false);

    expect(leaving.latitude).toBe(40.7);
    expect(leaving.longitude).toBe(-74.0);
    expect(leaving.radius).toBe(250);
    expect(leaving.notifyOnEnter).toBe(false);
    expect(leaving.notifyOnExit).toBe(true);
  });

  it('the plan carries the banner payload the headless handler needs', () => {
    const plan = buildGeofencePlan([place('p', { trigger: 'leave', label: 'Gym' }, { title: 'Leg day' })]);
    expect(plan.payloads).toEqual([{ taskId: 'p', title: 'Leg day', trigger: 'leave', label: 'Gym' }]);
  });
});

describe('geofence sync engine', () => {
  it('first sync stops the OS, asks permission and starts with the plan', async () => {
    const h = harness();
    const engine = createGeofenceSyncEngine(h.deps);
    await engine.sync([place('p')]);
    expect(h.ops).toEqual(['stop', 'permission', `start(${OS})`]);
    expect(h.starts).toHaveLength(1);
  });

  it('an identical sync afterwards never touches the OS', async () => {
    const h = harness();
    const engine = createGeofenceSyncEngine(h.deps);
    await engine.sync([place('p')]);
    h.ops.length = 0;
    await engine.sync([place('p')]);
    await engine.sync([place('p')]);
    expect(h.ops).toEqual([]);
  });

  it('editing a fence re-arms it with the new coordinates', async () => {
    const h = harness();
    const engine = createGeofenceSyncEngine(h.deps);
    await engine.sync([place('p')]);
    await engine.sync([place('p', { latitude: 52.52, longitude: 13.405 })]);
    expect(h.ops).toEqual([
      'stop',
      'permission',
      `start(${OS})`,
      'stop',
      'permission',
      `start(${OS})`,
    ]);
    expect(h.starts.at(-1)?.regions[0]?.latitude).toBe(52.52);
    expect(h.starts.at(-1)?.regions[0]?.longitude).toBe(13.405);
  });

  it('the last fence closing stops the OS once and is remembered', async () => {
    const h = harness();
    const engine = createGeofenceSyncEngine(h.deps);
    await engine.sync([place('p')]);
    h.ops.length = 0;
    await engine.sync([task('plain')]);
    expect(h.ops).toEqual(['stop']);
    await engine.sync([task('plain')]);
    expect(h.ops).toEqual(['stop']);
  });

  it('REGRESSION: a denied permission is not recorded, so the next sync retries', async () => {
    const h = harness(false);
    const engine = createGeofenceSyncEngine(h.deps);
    await engine.sync([place('p')]);
    expect(h.ops).toEqual(['stop', 'permission']);
    expect(h.starts).toHaveLength(0);

    h.grant.value = true;
    await engine.sync([place('p')]);
    expect(h.starts).toHaveLength(1);

    h.ops.length = 0;
    await engine.sync([place('p')]);
    expect(h.ops).toEqual([]);
  });

  it('REGRESSION: a throwing start leaves the gate stale and the next sync retries', async () => {
    const h = harness();
    const engine = createGeofenceSyncEngine(h.deps);
    h.failStart.value = true;
    await engine.sync([place('p')]);
    expect(h.ops).toEqual(['stop', 'permission', `start(${OS})`]);
    expect(h.starts).toHaveLength(0);

    h.failStart.value = false;
    await engine.sync([place('p')]);
    expect(h.starts).toHaveLength(1);

    h.ops.length = 0;
    await engine.sync([place('p')]);
    expect(h.ops).toEqual([]);
  });

  it('completing a fenced task re-arms the set without it', async () => {
    const h = harness();
    const engine = createGeofenceSyncEngine(h.deps);
    await engine.sync([place('a'), place('b')]);
    expect(h.starts.at(-1)?.regions).toHaveLength(2);

    await engine.sync([place('a'), place('b', {}, { status: 'done' })]);
    expect(h.starts.at(-1)?.regions.map((region) => region.identifier)).toEqual(['taskflow:a']);
  });

  it('overlapping syncs are queued in order, so the last mutation wins', async () => {
    const h = harness();
    const engine = createGeofenceSyncEngine(h.deps);
    const first = engine.sync([place('a')]);
    const second = engine.sync([place('b')]);
    await Promise.all([first, second]);

    expect(h.ops).toEqual([
      'stop',
      'permission',
      'start(taskflow:a)',
      'stop',
      'permission',
      'start(taskflow:b)',
    ]);

    h.ops.length = 0;
    await engine.sync([place('b')]);
    expect(h.ops).toEqual([]);
    await engine.sync([place('a')]);
    expect(h.ops).toHaveLength(3);
  });

  it('reset() forces identical input to re-arm (clearGeofences semantics)', async () => {
    const h = harness();
    const engine = createGeofenceSyncEngine(h.deps);
    await engine.sync([place('p')]);
    h.ops.length = 0;
    await engine.sync([place('p')]);
    expect(h.ops).toEqual([]);

    engine.reset();
    await engine.sync([place('p')]);
    expect(h.ops).toEqual(['stop', 'permission', `start(${OS})`]);
  });
});
