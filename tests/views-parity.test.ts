/**
 * Cross-view parity audit.
 *
 * All four layouts read the same store slice, so a task "exists" everywhere —
 * but until this pass two of them could only *open* a task. List had
 * swipe-to-complete, Board had the advance arrow, and Agenda/Matrix left you to
 * bounce through the detail screen to finish anything. That is the kind of gap
 * inspection misses: every individual view looks finished.
 *
 * There is no renderer in this suite, so the audit is static and deliberately
 * narrow — it checks the two things that must be true for the affordance to
 * exist at all: the view receives a completion callback (a required prop, not
 * an optional one) and it labels that control for a screen reader. It does not
 * try to prove the layout, which a device render has to answer.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const views = {
  agenda: 'src/components/views/CalendarAgenda.tsx',
  matrix: 'src/components/views/EisenhowerMatrix.tsx',
  board: 'src/components/views/KanbanBoard.tsx',
  dashboard: 'src/components/TaskDashboard.tsx',
} as const;

describe('every task view can complete a task', () => {
  it('agenda and matrix take a required onToggle, not an optional one', () => {
    for (const path of [views.agenda, views.matrix]) {
      const source = read(path);
      expect(source, `${path} does not accept onToggle`).toMatch(/\bonToggle:\s*\(id: string\)/);
      expect(source, `${path} makes onToggle optional, so a caller can skip it`).not.toMatch(
        /onToggle\?:/,
      );
    }
  });

  it('agenda and matrix render a checkbox carrying the shared toggle label', () => {
    for (const path of [views.agenda, views.matrix]) {
      const source = read(path);
      expect(source, `${path} has no checkbox role`).toContain('accessibilityRole="checkbox"');
      expect(source, `${path} does not announce completion state`).toContain(
        'accessibilityState={{ checked:',
      );
      // The same label builder the list card uses, so the verb matches
      // everywhere ("Mark “x” complete" / "not complete").
      expect(source, `${path} has no accessible toggle label`).toContain('toggleTaskLabel(');
    }
  });

  it('the board completes by advancing, and says where it will move a card', () => {
    const source = read(views.board);
    expect(source).toMatch(/\bonMove:\s*\(id: string, status: TaskStatus\)/);
    expect(source).toContain('accessibilityLabel={`Move “${task.title}” to ');
  });

  it('the dashboard wires all three views to real store actions', () => {
    const source = read(views.dashboard);
    expect(source).toMatch(/<CalendarAgenda[^>]*onToggle=\{toggleTask\}/s);
    expect(source).toMatch(/<EisenhowerMatrix[^>]*onToggle=\{toggleTask\}/s);
    expect(source).toMatch(/<KanbanBoard[^>]*onMove=\{handleMove\}/s);
  });

  it('completion goes through the store path, never a raw field patch', () => {
    // `setStatus` stamps `completed_at` and re-arms or cancels the task's
    // reminders; writing `status` directly would silently skip all of that.
    const source = read(views.dashboard);
    expect(source).not.toMatch(/setStatus\([^)]*,\s*status\b[^)]*\)\s*\.then/);
    expect(source).toMatch(/const handleMove = useCallback\(/);
  });
});
