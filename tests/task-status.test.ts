/**
 * The board's status path.
 *
 * The Kanban advance used to write `status` through a plain field patch, which
 * left `completed_at` null and the task's subtasks open — a task "done" on the
 * board was missing from the completion counts and its reminders kept firing.
 * `setTaskStatus` is the path the board now uses; these assertions pin what it
 * has to do, against the real repository code and a throwaway database.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/client', async () => {
  const { harness } = await import('./support/syncHarness');
  return { getDatabase: async () => harness.adapter };
});

const { setTaskStatus } = await import('@/db/repositories/tasks');
const { harness } = await import('./support/syncHarness');

const AT = '2026-10-04T10:00:00.000Z';

afterAll(() => {
  harness.drop();
});

beforeEach(() => {
  harness.reset();
});

function seed(id: string, overrides: Record<string, unknown> = {}): void {
  const row: Record<string, unknown> = {
    id,
    project_id: null,
    parent_id: null,
    title: `Task ${id}`,
    notes: '',
    status: 'todo',
    priority: 'none',
    due_at: null,
    remind_at: null,
    recurrence: null,
    location_reminder: null,
    estimate_minutes: null,
    attachments: '[]',
    position: 0,
    completed_at: null,
    created_at: AT,
    updated_at: AT,
    deleted_at: null,
    field_meta: '{}',
    sync_state: 'synced',
    ...overrides,
  };
  const columns = Object.keys(row);
  harness.db
    .prepare(
      `INSERT OR REPLACE INTO tasks (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(...columns.map((column) => row[column] as never));
}

function task(id: string): Record<string, unknown> {
  return harness.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>;
}

describe('setTaskStatus', () => {
  it('stamps completion when a task is moved to done', async () => {
    seed('task_1');
    await setTaskStatus('task_1', 'done');

    const row = task('task_1');
    expect(row.status).toBe('done');
    expect(typeof row.completed_at).toBe('string');
    expect(row.sync_state).toBe('pending');
  });

  it('clears the completion stamp when a task comes back out of done', async () => {
    seed('task_1', { status: 'done', completed_at: '2026-10-01T09:00:00.000Z' });
    await setTaskStatus('task_1', 'in_progress');

    expect(task('task_1').status).toBe('in_progress');
    expect(task('task_1').completed_at).toBeNull();
  });

  it('completes the subtasks too, exactly like the checkbox does', async () => {
    seed('parent');
    seed('child_a', { parent_id: 'parent' });
    seed('child_b', { parent_id: 'parent' });

    await setTaskStatus('parent', 'done');

    expect(task('child_a').status).toBe('done');
    expect(task('child_b').status).toBe('done');
    expect(typeof task('child_a').completed_at).toBe('string');
  });

  it('leaves the subtasks alone when the move is not a completion', async () => {
    seed('parent');
    seed('child_a', { parent_id: 'parent' });

    await setTaskStatus('parent', 'in_progress');

    expect(task('child_a').status).toBe('todo');
  });
});
