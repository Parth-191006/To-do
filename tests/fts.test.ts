/**
 * FTS5 query-building suite.
 *
 * `tasks_fts` existed since day one but was never queried — search ran a
 * `LIKE '%…%'` scan, so the README's "search (FTS5)" claim was false and search
 * got slower as the list grew. The pure half of the fix lives in `@/db/fts`.
 *
 * Two properties matter on a phone: a stray `"` or `-` typed mid-word must never
 * make the query throw, and one- and two-character queries must take the LIKE
 * path because an index scan that matches everything is worse than useless.
 * The first property is checked against a *real* FTS5 index below, not against
 * a string comparison — an FTS5 syntax error is only visible at MATCH time.
 */
import { DatabaseSync } from 'node:sqlite';

import { afterAll, describe, expect, it } from 'vitest';

import { MIN_FTS_LENGTH, buildFtsQuery, shouldUseFts } from '@/db/fts';

describe('buildFtsQuery', () => {
  it('turns a phrase into prefix terms', () => {
    expect(buildFtsQuery('buy milk')).toBe('buy* milk*');
  });

  it('matches as the user types, one character at a time', () => {
    expect(buildFtsQuery('report')).toBe('report*');
  });

  it('collapses extra whitespace', () => {
    expect(buildFtsQuery('  buy   milk  ')).toBe('buy* milk*');
  });

  it('drops FTS5 operators so no query can be malformed', () => {
    expect(buildFtsQuery('"buy milk"')).toBe('buy* milk*');
    expect(buildFtsQuery('report:')).toBe('report*');
    expect(buildFtsQuery('fix - bug')).toBe('fix* bug*');
    expect(buildFtsQuery('(urgent)')).toBe('urgent*');
    expect(buildFtsQuery('a^b*c{d}')).toBe('a* b* c* d*');
  });

  it('keeps words joined by punctuation searchable, and drops the rest', () => {
    expect(buildFtsQuery("don't")).toBe('don* t*');
    expect(buildFtsQuery('#report')).toBe('report*');
    expect(buildFtsQuery('2026-10-04')).toBe('2026* 10* 04*');
  });

  it('quotes FTS5 operator words so they are searched for, not obeyed', () => {
    expect(buildFtsQuery('milk AND eggs')).toBe('milk* "AND"* eggs*');
    expect(buildFtsQuery('NEAR OR NOT')).toBe('"NEAR"* "OR"* "NOT"*');
    expect(buildFtsQuery('or')).toBe('or*');
    expect(buildFtsQuery('near')).toBe('near*');
  });

  it('returns null when there is nothing indexable to search for', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('   ')).toBeNull();
    expect(buildFtsQuery('"""')).toBeNull();
    expect(buildFtsQuery('- - -')).toBeNull();
    expect(buildFtsQuery('()[]{}')).toBeNull();
    expect(buildFtsQuery('!!! ## ~~')).toBeNull();
    expect(buildFtsQuery('💥✨')).toBeNull();
  });
});

describe('shouldUseFts', () => {
  it('uses the index from the minimum length upward', () => {
    expect(shouldUseFts('mil')).toBe(true);
    expect('mil'.length).toBe(MIN_FTS_LENGTH);
  });

  it('falls back to LIKE for one- and two-character queries', () => {
    expect(shouldUseFts('m')).toBe(false);
    expect(shouldUseFts('mi')).toBe(false);
    expect(shouldUseFts('  m  ')).toBe(false);
  });

  it('ignores whitespace padding when measuring length', () => {
    expect(shouldUseFts('  milk  ')).toBe(true);
    expect('  milk  '.trim().length).toBeGreaterThan(MIN_FTS_LENGTH);
  });

  it('rejects input that is only punctuation or emoji, whatever its length', () => {
    expect(shouldUseFts('"""')).toBe(false);
    expect(shouldUseFts('!!! ## ~~')).toBe(false);
    expect(shouldUseFts('💥💥💥💥💥')).toBe(false);
    expect(shouldUseFts('')).toBe(false);
  });
});

/**
 * The contract the repository relies on: whatever `buildFtsQuery` produces is a
 * valid FTS5 expression. The first pass proves it structurally; this proves it
 * against SQLite itself, which is the only place a syntax error can appear.
 */
describe('every query is accepted by real FTS5', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE VIRTUAL TABLE docs USING fts5(title, notes)`);
  const insert = db.prepare('INSERT INTO docs(title, notes) VALUES (?, ?)');
  insert.run('Write the report', "don't forget the charts");
  insert.run('Buy milk', 'two litres, semi-skimmed');
  insert.run('Team standup', 'every monday at 9am');

  afterAll(() => db.close());

  const search = db.prepare('SELECT rowid FROM docs WHERE docs MATCH ?');

  it('never throws, whatever the user typed', () => {
    const hostile = [
      '"buy milk',
      'report:',
      'fix - bug',
      '(urgent)',
      'a^b*c{d}',
      '#report',
      '2026-10-04',
      "don't",
      'NEAR AND OR NOT',
      '!!! ## ~~',
      '💥💥💥',
      ') OR (',
    ];

    for (const input of hostile) {
      const query = buildFtsQuery(input);
      if (query === null) continue;
      expect(() => search.all(query), `"${input}" produced "${query}"`).not.toThrow();
    }
  });

  it('finds the row when the user types an apostrophised word', () => {
    const query = buildFtsQuery("don't");
    expect(query).toBe('don* t*');
    const rows = search.all(query) as { rowid: number }[];
    expect(rows).toHaveLength(1);
  });

  it('finds rows by a prefix, which is what the search box needs', () => {
    const rows = search.all(buildFtsQuery('rep')) as { rowid: number }[];
    expect(rows).toHaveLength(1);
  });

  it('answers with nothing rather than failing for punctuation-only input', () => {
    expect(buildFtsQuery('!!! ## ~~')).toBeNull();
    expect(shouldUseFts('!!! ## ~~')).toBe(false);
  });
});
