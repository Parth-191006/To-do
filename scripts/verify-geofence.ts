/**
 * Geofence re-arm regression suite.
 *
 * This exists because place reminders used to arm only at cold start:
 * `syncGeofences` ran once from `bootstrap()`, so a reminder added in the
 * editor stayed dark until the app was killed and reopened. The fix was to
 * call it after every task mutation, which is only safe and affordable with
 * the signature gate in `src/services/notifications/geofenceSync.ts`:
 *
 *  - unchanged fence set  → the OS is never touched;
 *  - denied permission    → the signature is NOT recorded, so the next call
 *                           retries (otherwise a single denial would leave
 *                           the fence permanently unregistered);
 *  - a throwing start     → same: stale signature, natural retry;
 *  - overlapping syncs    → queued, so the last mutation wins in order.
 *
 * The module under test has no native imports — expo-location and
 * expo-task-manager cannot load under Node — so the OS is faked through the
 * injected deps and every side effect is an entry in an `ops` log.
 *
 * Run with: npm run verify:geofence
 */
import assert from 'node:assert/strict';

import type { LocationReminder, TaskWithTags, TaskStatus } from '../src/domain/types.ts';
import {
  buildGeofencePlan,
  createGeofenceSyncEngine,
  regionIdForTask,
  signatureForTasks,
  taskIdFromRegion,
  type GeofencePlan,
  type GeofenceSyncDeps,
} from '../src/services/notifications/geofenceSync.ts';

let passed = 0;

function check(name: string, run: () => void | Promise<void>): void {
  const done = () => {
    passed += 1;
    console.log(`  ok  ${name}`);
  };
  const fail = (error: unknown) => {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  };
  try {
    const result = run();
    if (result instanceof Promise) {
      result.then(done, fail);
      queue.push(result.then(() => undefined, () => undefined));
    } else {
      done();
    }
  } catch (error) {
    fail(error);
  }
}

/** Async checks settle before the summary prints. */
const queue: Promise<void>[] = [];

/* -------------------------------------------------------------------------- */
/*                                  fixtures                                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                              signature surface                              */
/* -------------------------------------------------------------------------- */

check('tasks without a place (or already done) share one empty signature', () => {
  assert.equal(signatureForTasks([]), '');
  assert.equal(signatureForTasks([task('a')]), '');
  // A completed fenced task must drop out of the effective set entirely.
  assert.equal(signatureForTasks([place('p', {}, { status: 'done' })]), '');
  assert.equal(signatureForTasks([place('p', {}, { status: 'archived' })]), '');
});

check('the signature reacts to every field a fence is built from', () => {
  const base = place('p');
  const original = signatureForTasks([base]);

  assert.notEqual(signatureForTasks([base, place('q')]), original, 'adding a fence');
  assert.notEqual(signatureForTasks([place('p', { latitude: 51.6 })]), original, 'latitude');
  assert.notEqual(signatureForTasks([place('p', { longitude: 0.1 })]), original, 'longitude');
  assert.notEqual(signatureForTasks([place('p', { radius: 300 })]), original, 'radius');
  assert.notEqual(signatureForTasks([place('p', { trigger: 'leave' })]), original, 'trigger');
  assert.notEqual(signatureForTasks([place('p', { label: 'Home' })]), original, 'label');
  assert.notEqual(
    signatureForTasks([place('p', {}, { title: 'Renamed task' })]),
    original,
    'banner title',
  );
  // Completing the only fenced task clears the set.
  assert.notEqual(
    signatureForTasks([place('p', {}, { status: 'done' })]),
    original,
    'completing the task',
  );
});

check('rebuilt identical input and reordering are signature-stable', () => {
  const a = place('a');
  const b = place('b');
  assert.equal(signatureForTasks([a]), signatureForTasks([place('a')]));
  assert.equal(signatureForTasks([a, b]), signatureForTasks([b, a]));
  assert.equal(signatureForTasks([a, b]), signatureForTasks([b, a, task('plain')]));
});

check('region ids round-trip the task id and reject foreign regions', () => {
  assert.equal(regionIdForTask('task_7'), 'taskflow:task_7');
  assert.equal(taskIdFromRegion('taskflow:task_7'), 'task_7');
  assert.equal(taskIdFromRegion('other:task_7'), null);
  assert.equal(taskIdFromRegion('taskflow:'), null);
  assert.equal(taskIdFromRegion(''), null);
});

check('the plan maps reminders to OS regions with a 150 m default radius', () => {
  const plan = buildGeofencePlan([
    place('p', { radius: 0, trigger: 'enter' }),
    place('q', { latitude: 40.7, longitude: -74.0, radius: 250, trigger: 'leave' }),
  ]);

  assert.equal(plan.regions.length, 2);
  const [entering, leaving] = plan.regions;

  assert.equal(entering.identifier, 'taskflow:p');
  assert.equal(entering.radius, 150, 'radius 0 falls back to the default');
  assert.equal(entering.notifyOnEnter, true);
  assert.equal(entering.notifyOnExit, false);

  assert.equal(leaving.latitude, 40.7);
  assert.equal(leaving.longitude, -74.0);
  assert.equal(leaving.radius, 250);
  assert.equal(leaving.notifyOnEnter, false);
  assert.equal(leaving.notifyOnExit, true);
});

check('the plan carries the banner payload the headless handler needs', () => {
  const plan = buildGeofencePlan([place('p', { trigger: 'leave', label: 'Gym' }, { title: 'Leg day' })]);
  assert.deepEqual(plan.payloads, [
    { taskId: 'p', title: 'Leg day', trigger: 'leave', label: 'Gym' },
  ]);
});

/* -------------------------------------------------------------------------- */
/*                             engine: the gate                                */
/* -------------------------------------------------------------------------- */

check('first sync stops the OS, asks permission and starts with the plan', async () => {
  const h = harness();
  const engine = createGeofenceSyncEngine(h.deps);

  await engine.sync([place('p')]);
  assert.deepEqual(h.ops, ['stop', 'permission', `start(${OS})`]);
  assert.equal(h.starts.length, 1);
});

check('an identical sync afterwards never touches the OS', async () => {
  const h = harness();
  const engine = createGeofenceSyncEngine(h.deps);

  await engine.sync([place('p')]);
  h.ops.length = 0;

  // The store syncs after every mutation — this skip is what makes that free.
  await engine.sync([place('p')]);
  await engine.sync([place('p')]);
  assert.deepEqual(h.ops, [], 'unchanged fences must not reach the OS');
});

check('editing a fence re-arms it with the new coordinates', async () => {
  const h = harness();
  const engine = createGeofenceSyncEngine(h.deps);

  await engine.sync([place('p')]);
  await engine.sync([place('p', { latitude: 52.52, longitude: 13.405 })]);

  assert.deepEqual(h.ops, [
    'stop',
    'permission',
    `start(${OS})`,
    'stop',
    'permission',
    `start(${OS})`,
  ]);
  const latest = h.starts.at(-1);
  assert.equal(latest?.regions[0]?.latitude, 52.52);
  assert.equal(latest?.regions[0]?.longitude, 13.405);
});

check('the last fence closing stops the OS once and is remembered', async () => {
  const h = harness();
  const engine = createGeofenceSyncEngine(h.deps);

  await engine.sync([place('p')]);
  h.ops.length = 0;

  await engine.sync([task('plain')]); // fence removed → stop only, no permission/start
  assert.deepEqual(h.ops, ['stop']);

  await engine.sync([task('plain')]); // unchanged empty set → skip
  assert.deepEqual(h.ops, ['stop']);
});

check('REGRESSION: a denied permission is not recorded, so the next sync retries', async () => {
  const h = harness(false);
  const engine = createGeofenceSyncEngine(h.deps);

  await engine.sync([place('p')]);
  // Permission refused: nothing registered, and crucially no signature saved.
  assert.deepEqual(h.ops, ['stop', 'permission']);
  assert.equal(h.starts.length, 0);

  // Same input later, permission now available — must NOT be skipped.
  h.grant.value = true;
  await engine.sync([place('p')]);
  assert.equal(h.starts.length, 1, 'the fence must arm on the retry');

  // …and only now is the set considered synced.
  h.ops.length = 0;
  await engine.sync([place('p')]);
  assert.deepEqual(h.ops, [], 'after a successful arm the gate closes again');
});

check('REGRESSION: a throwing start leaves the gate stale and the next sync retries', async () => {
  const h = harness();
  const engine = createGeofenceSyncEngine(h.deps);

  h.failStart.value = true;
  await engine.sync([place('p')]); // must never reject — sync is fire-and-forget
  assert.deepEqual(h.ops, ['stop', 'permission', `start(${OS})`]);
  assert.equal(h.starts.length, 0, 'a failed start must not be recorded as synced');

  h.failStart.value = false;
  await engine.sync([place('p')]);
  assert.equal(h.starts.length, 1, 'the retry arms the fence');

  h.ops.length = 0;
  await engine.sync([place('p')]);
  assert.deepEqual(h.ops, [], 'gate closed after the successful retry');
});

check('completing a fenced task re-arms the set without it', async () => {
  const h = harness();
  const engine = createGeofenceSyncEngine(h.deps);

  await engine.sync([place('a'), place('b')]);
  assert.equal(h.starts.at(-1)?.regions.length, 2);

  await engine.sync([place('a'), place('b', {}, { status: 'done' })]);
  const latest = h.starts.at(-1);
  assert.deepEqual(
    latest?.regions.map((region) => region.identifier),
    ['taskflow:a'],
    'the finished task must drop out of the registered set',
  );
});

check('overlapping syncs are queued in order, so the last mutation wins', async () => {
  const h = harness();
  const engine = createGeofenceSyncEngine(h.deps);

  // Fire two syncs without awaiting — mutations can arrive back to back.
  const first = engine.sync([place('a')]);
  const second = engine.sync([place('b')]);
  await Promise.all([first, second]);

  assert.deepEqual(h.ops, [
    'stop',
    'permission',
    'start(taskflow:a)',
    'stop',
    'permission',
    'start(taskflow:b)',
  ]);

  // The gate must end on the LAST sync's state, not the first's.
  h.ops.length = 0;
  await engine.sync([place('b')]);
  assert.deepEqual(h.ops, [], 'second sync state is the recorded one');
  await engine.sync([place('a')]);
  assert.deepEqual(h.ops.length, 3, 'going back to the first set re-arms');
});

check('reset() forces identical input to re-arm (clearGeofences semantics)', async () => {
  const h = harness();
  const engine = createGeofenceSyncEngine(h.deps);

  await engine.sync([place('p')]);
  h.ops.length = 0;
  await engine.sync([place('p')]);
  assert.deepEqual(h.ops, [], 'gate closed');

  engine.reset(); // the OS was wiped behind our back
  await engine.sync([place('p')]);
  assert.deepEqual(h.ops, ['stop', 'permission', `start(${OS})`]);
});

/* -------------------------------------------------------------------------- */

Promise.all(queue).then(() => {
  console.log(`\nverify-geofence: ${passed} checks passed`);
});
