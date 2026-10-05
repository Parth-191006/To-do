/**
 * Natural-language parser suite.
 *
 * Ported verbatim from `scripts/verify-nlp.ts` (15 assertions) plus the two
 * cases the audit added: `~estimate` parsing on a bare task, and the total
 * absence of a crash on punctuation-only input.
 */
import { describe, expect, it } from 'vitest';

import { describeRecurrence, parseTaskInput } from '@/nlp/parser';

// Fixed reference point: Wednesday 10 June 2026, 09:00 local time.
const NOW = new Date(2026, 5, 10, 9, 0, 0, 0);

function clock(iso: string | null): string {
  if (!iso) throw new Error('expected a resolved date');
  const date = new Date(iso);
  return `${date.getDate()}/${date.getMonth() + 1} ${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

describe('parseTaskInput', () => {
  it('extracts title, date, time, tag and priority', () => {
    const parsed = parseTaskInput('Submit project report tomorrow at 5pm #Work !high', { now: NOW });
    expect(parsed.title).toBe('Submit project report');
    expect(parsed.priority).toBe('high');
    expect(parsed.tags).toEqual(['Work']);
    expect(clock(parsed.dueAt)).toBe('11/6 17:00');
  });

  it('leaves a plain task untouched', () => {
    const parsed = parseTaskInput('Call mom', { now: NOW });
    expect(parsed.title).toBe('Call mom');
    expect(parsed.dueAt).toBeNull();
    expect(parsed.priority).toBe('none');
    expect(parsed.tags).toEqual([]);
  });

  it('parses relative dates and hour:minute estimates', () => {
    const parsed = parseTaskInput('Buy groceries in 2 days ~30m', { now: NOW });
    expect(parsed.estimateMinutes).toBe(30);
    expect(clock(parsed.dueAt)).toBe('12/6 09:00');
  });

  it('parses hourly estimates', () => {
    const parsed = parseTaskInput('Deep work session ~1.5h', { now: NOW });
    expect(parsed.estimateMinutes).toBe(90);
  });

  it('parses weekly recurrence onto a weekday', () => {
    const parsed = parseTaskInput('Team standup every monday at 9am', { now: NOW });
    expect(parsed.recurrence?.frequency).toBe('weekly');
    expect(parsed.recurrence?.byWeekday).toEqual([1]);
    expect(clock(parsed.dueAt)).toBe('15/6 09:00');
    expect(describeRecurrence(parsed.recurrence)).toBe('Weekly on Monday');
  });

  it('parses bare daily recurrence', () => {
    const parsed = parseTaskInput('Take vitamins daily', { now: NOW });
    expect(parsed.recurrence?.frequency).toBe('daily');
    expect(parsed.title).toBe('Take vitamins');
  });

  it('parses explicit month/day dates', () => {
    const parsed = parseTaskInput('File taxes on 12/25 #Finance', { now: NOW });
    expect(clock(parsed.dueAt)).toBe('25/12 09:00');
    expect(parsed.tags).toEqual(['Finance']);
  });

  it('rolls a pastish numeric date into next year', () => {
    const parsed = parseTaskInput('Anniversary 1/4', { now: NOW });
    expect(clock(parsed.dueAt)).toBe('4/1 09:00');
    expect(new Date(parsed.dueAt as string).getFullYear()).toBe(2027);
  });

  it('parses named month with ordinal day', () => {
    const parsed = parseTaskInput('Ship v2 on March 3rd', { now: NOW });
    expect(clock(parsed.dueAt)).toBe('3/3 09:00');
  });

  it('parses @project hints and priority shorthands', () => {
    const parsed = parseTaskInput('Refactor billing @Work !!!', { now: NOW });
    expect(parsed.projectHint).toBe('Work');
    expect(parsed.priority).toBe('urgent');
    expect(parsed.title).toBe('Refactor billing');
  });

  it('parses p1..p4 priority shorthands', () => {
    const parsed = parseTaskInput('Fix the leak p1', { now: NOW });
    expect(parsed.priority).toBe('urgent');
    expect(parsed.title).toBe('Fix the leak');
  });

  it('resolves tonight to an evening time', () => {
    const parsed = parseTaskInput('Movie tonight', { now: NOW });
    expect(clock(parsed.dueAt)).toBe('10/6 20:00');
  });

  it('keeps a yesterday-dated task in the past instead of rolling it forward', () => {
    // Found while auditing capture: "yesterday" was not a date word, so the
    // bare "5pm" won and the task was scheduled for *later today*.
    const parsed = parseTaskInput('Email the invoice yesterday 5pm #work ~20m', { now: NOW });
    expect(parsed.title).toBe('Email the invoice');
    expect(clock(parsed.dueAt)).toBe('9/6 17:00');
    expect(parsed.dueAt && new Date(parsed.dueAt).getTime() < NOW.getTime()).toBe(true);
    expect(parsed.tags).toEqual(['work']);
    expect(parsed.estimateMinutes).toBe(20);
  });

  it('defaults a bare yesterday to 9am the previous day', () => {
    const parsed = parseTaskInput('Sign the form yesterday', { now: NOW });
    expect(parsed.title).toBe('Sign the form');
    expect(clock(parsed.dueAt)).toBe('9/6 09:00');
  });

  it('reports token spans for inline highlighting', () => {
    const parsed = parseTaskInput('Pay rent tomorrow #home !high', { now: NOW });
    const kinds = parsed.tokens.map((token) => token.kind).sort();
    expect(kinds).toEqual(['date', 'priority', 'tag']);
    for (const token of parsed.tokens) {
      expect('Pay rent tomorrow #home !high'.slice(token.start, token.end)).toBe(token.text);
    }
  });

  it('sets remindAt ahead of the due time', () => {
    const parsed = parseTaskInput('Standup tomorrow at 9am', { now: NOW });
    expect(parsed.remindAt).toBeTruthy();
    expect(clock(parsed.remindAt)).toBe('11/6 08:30');
  });

  it('handles an empty string safely', () => {
    const parsed = parseTaskInput('', { now: NOW });
    expect(parsed.title).toBe('');
    expect(parsed.dueAt).toBeNull();
    expect(parsed.tokens).toEqual([]);
  });

  it('survives input that is only markers', () => {
    const parsed = parseTaskInput('!!! ## ~~', { now: NOW });
    // Whatever it decides, it must not throw and must not invent a date.
    expect(parsed.dueAt).toBeNull();
  });
});
