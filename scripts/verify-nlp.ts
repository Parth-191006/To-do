/**
 * NLP parser verification.
 *
 * Run with:  npm run verify:nlp
 *
 * Node's built-in type stripping executes the TypeScript directly, so this
 * checks the real parser the app ships — no build step, no test framework.
 */
import assert from 'node:assert/strict';

import { describeRecurrence, parseTaskInput } from '../src/nlp/parser.ts';

// Fixed reference point: Wednesday 10 June 2026, 09:00 local time.
const NOW = new Date(2026, 5, 10, 9, 0, 0, 0);

let passed = 0;

function check(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

function clock(iso: string | null): string {
  assert.ok(iso, 'expected a resolved date');
  const date = new Date(iso);
  return `${date.getDate()}/${date.getMonth() + 1} ${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

check('extracts title, date, time, tag and priority', () => {
  const parsed = parseTaskInput('Submit project report tomorrow at 5pm #Work !high', { now: NOW });
  assert.equal(parsed.title, 'Submit project report');
  assert.equal(parsed.priority, 'high');
  assert.deepEqual(parsed.tags, ['Work']);
  assert.equal(clock(parsed.dueAt), '11/6 17:00');
});

check('leaves a plain task untouched', () => {
  const parsed = parseTaskInput('Call mom', { now: NOW });
  assert.equal(parsed.title, 'Call mom');
  assert.equal(parsed.dueAt, null);
  assert.equal(parsed.priority, 'none');
  assert.deepEqual(parsed.tags, []);
});

check('parses relative dates and hour:minute estimates', () => {
  const parsed = parseTaskInput('Buy groceries in 2 days ~30m', { now: NOW });
  assert.equal(parsed.estimateMinutes, 30);
  assert.equal(clock(parsed.dueAt), '12/6 09:00');
});

check('parses hourly estimates', () => {
  const parsed = parseTaskInput('Deep work session ~1.5h', { now: NOW });
  assert.equal(parsed.estimateMinutes, 90);
});

check('parses weekly recurrence onto a weekday', () => {
  const parsed = parseTaskInput('Team standup every monday at 9am', { now: NOW });
  assert.equal(parsed.recurrence?.frequency, 'weekly');
  assert.deepEqual(parsed.recurrence?.byWeekday, [1]);
  assert.equal(clock(parsed.dueAt), '15/6 09:00');
  assert.equal(describeRecurrence(parsed.recurrence), 'Weekly on Monday');
});

check('parses bare daily recurrence', () => {
  const parsed = parseTaskInput('Take vitamins daily', { now: NOW });
  assert.equal(parsed.recurrence?.frequency, 'daily');
  assert.equal(parsed.title, 'Take vitamins');
});

check('parses explicit month/day dates', () => {
  const parsed = parseTaskInput('File taxes on 12/25 #Finance', { now: NOW });
  assert.equal(clock(parsed.dueAt), '25/12 09:00');
  assert.deepEqual(parsed.tags, ['Finance']);
});

check('rolls a pastish numeric date into next year', () => {
  const parsed = parseTaskInput('Anniversary 1/4', { now: NOW });
  assert.equal(clock(parsed.dueAt), '4/1 09:00');
  assert.equal(new Date(parsed.dueAt as string).getFullYear(), 2027);
});

check('parses named month with ordinal day', () => {
  const parsed = parseTaskInput('Ship v2 on March 3rd', { now: NOW });
  assert.equal(clock(parsed.dueAt), '3/3 09:00');
});

check('parses @project hints and priority shorthands', () => {
  const parsed = parseTaskInput('Refactor billing @Work !!!', { now: NOW });
  assert.equal(parsed.projectHint, 'Work');
  assert.equal(parsed.priority, 'urgent');
  assert.equal(parsed.title, 'Refactor billing');
});

check('parses p1..p4 priority shorthands', () => {
  const parsed = parseTaskInput('Fix the leak p1', { now: NOW });
  assert.equal(parsed.priority, 'urgent');
  assert.equal(parsed.title, 'Fix the leak');
});

check('resolves tonight to an evening time', () => {
  const parsed = parseTaskInput('Movie tonight', { now: NOW });
  assert.equal(clock(parsed.dueAt), '10/6 20:00');
});

check('reports token spans for inline highlighting', () => {
  const parsed = parseTaskInput('Pay rent tomorrow #home !high', { now: NOW });
  const kinds = parsed.tokens.map((token) => token.kind).sort();
  assert.deepEqual(kinds, ['date', 'priority', 'tag']);
  for (const token of parsed.tokens) {
    assert.equal('Pay rent tomorrow #home !high'.slice(token.start, token.end), token.text);
  }
});

check('remindAt is set ahead of the due time', () => {
  const parsed = parseTaskInput('Standup tomorrow at 9am', { now: NOW });
  assert.ok(parsed.remindAt);
  assert.equal(clock(parsed.remindAt), '11/6 08:30');
});

check('handles an empty string safely', () => {
  const parsed = parseTaskInput('', { now: NOW });
  assert.equal(parsed.title, '');
  assert.equal(parsed.dueAt, null);
  assert.deepEqual(parsed.tokens, []);
});

console.log(`\n${passed} checks passed`);
