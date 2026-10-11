/**
 * Crash-log scrubbing suite.
 *
 * The scrubber is the whole privacy story of the opt-in crash log: if it lets
 * an email address or a token-shaped string through, the feature breaks its
 * own promise. These tests pin the three redaction rules, the dedupe/cap
 * behaviour of the queue, and the guarantee that `buildCrashReport` never
 * throws — a crash logger that throws on a string rejection would be worse
 * than none.
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_QUEUED_REPORTS,
  buildCrashReport,
  fingerprintCrash,
  formatCrashReports,
  queueCrashReport,
  scrubCrashText,
  type CrashReport,
} from '@/domain/crashLog';

const NOW = new Date('2026-10-10T12:00:00.000Z');

function report(overrides: Partial<CrashReport> = {}): CrashReport {
  return {
    fingerprint: 'deadbeef',
    message: 'Something broke',
    stack: 'Error: Something broke\n  at foo (app.js:1:1)',
    severity: 'fatal',
    appVersion: '1.2.3',
    platform: 'android',
    at: NOW.toISOString(),
    ...overrides,
  };
}

describe('scrubCrashText', () => {
  it('redacts email addresses', () => {
    expect(scrubCrashText('failed for parth@example.com, retrying')).toBe(
      'failed for [redacted-email], retrying',
    );
    expect(scrubCrashText('a@b.co and c.d+tag@e.org')).toBe(
      '[redacted-email] and [redacted-email]',
    );
  });

  it('redacts long token-like runs but keeps short ids', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9eyJzdWIiOiIxMjM0NTY3ODkwIn0';
    expect(scrubCrashText(`authorization ${token} leaked`)).toBe(
      'authorization [redacted-token] leaked',
    );
    // A task id (task_abc123, ~20 chars of base36) is what makes a report
    // actionable and identifies nothing on its own — it stays.
    expect(scrubCrashText('failed writing task_l8k2j4h6')).toBe(
      'failed writing task_l8k2j4h6',
    );
  });

  it('redacts long digit sequences (phone numbers, card-like strings)', () => {
    expect(scrubCrashText('sent to +447911123456')).toBe('sent to [redacted-digits]');
    expect(scrubCrashText('ref 12345')).toBe('ref 12345');
  });

  it('leaves ordinary technical messages untouched', () => {
    const message = 'Cannot read property tasks of undefined at bootstrap (store.js:42)';
    expect(scrubCrashText(message)).toBe(message);
  });
});

describe('fingerprintCrash', () => {
  it('is stable for the same message and first frame', () => {
    const a = fingerprintCrash('boom', 'Error: boom\n  at foo');
    const b = fingerprintCrash('boom', 'Error: boom\n  at foo\n  at bar');
    expect(a).toBe(b);
  });

  it('differs for different messages', () => {
    expect(fingerprintCrash('boom', 'at foo')).not.toBe(fingerprintCrash('bang', 'at foo'));
  });

  it('survives empty input', () => {
    expect(fingerprintCrash('', '')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('buildCrashReport', () => {
  it('extracts message and stack from an Error', () => {
    const error = new Error('database is locked');
    const built = buildCrashReport({
      error,
      severity: 'fatal',
      appVersion: '1.2.3',
      platform: 'android',
      now: NOW,
    });
    expect(built.message).toBe('database is locked');
    expect(built.stack).toContain('Error: database is locked');
    expect(built.severity).toBe('fatal');
    expect(built.at).toBe(NOW.toISOString());
  });

  it('scrubs PII out of the message and stack', () => {
    const error = new Error('sync failed for parth@example.com');
    error.stack = 'Error: sync failed for parth@example.com\n  at sync (sync.js:10:3)';
    const built = buildCrashReport({
      error,
      severity: 'handled',
      appVersion: '1.2.3',
      platform: 'ios',
      now: NOW,
    });
    expect(built.message).not.toContain('parth@example.com');
    expect(built.stack).not.toContain('parth@example.com');
    expect(built.message).toContain('[redacted-email]');
  });

  it('never throws on non-Error rejections', () => {
    for (const thrown of ['a string', 42, null, undefined, { weird: true }, Symbol('x')]) {
      expect(() =>
        buildCrashReport({
          error: thrown,
          severity: 'fatal',
          appVersion: '1.2.3',
          platform: 'android',
          now: NOW,
        }),
      ).not.toThrow();
    }
    const built = buildCrashReport({
      error: 'plain string failure',
      severity: 'handled',
      appVersion: '1.2.3',
      platform: 'android',
      now: NOW,
    });
    expect(built.message).toBe('plain string failure');
    expect(built.stack).toBe('');
  });

  it('caps runaway message and stack lengths', () => {
    const error = new Error('x'.repeat(10_000));
    error.stack = 'y'.repeat(50_000);
    const built = buildCrashReport({
      error,
      severity: 'fatal',
      appVersion: '1.2.3',
      platform: 'android',
      now: NOW,
    });
    expect(built.message.length).toBeLessThanOrEqual(300);
    expect(built.stack.length).toBeLessThanOrEqual(2_000);
  });
});

describe('queueCrashReport', () => {
  it('prepends newest first', () => {
    const queued = queueCrashReport([report({ fingerprint: 'aaaa' })], report({ fingerprint: 'bbbb' }));
    expect(queued.map((entry) => entry.fingerprint)).toEqual(['bbbb', 'aaaa']);
  });

  it('dedupes by fingerprint, keeping the newest', () => {
    const old = report({ fingerprint: 'aaaa', message: 'old' });
    const fresh = report({ fingerprint: 'aaaa', message: 'new' });
    const queued = queueCrashReport([old], fresh);
    expect(queued).toHaveLength(1);
    expect(queued[0].message).toBe('new');
  });

  it('caps the queue at MAX_QUEUED_REPORTS', () => {
    let queued: CrashReport[] = [];
    for (let i = 0; i < MAX_QUEUED_REPORTS + 10; i++) {
      queued = queueCrashReport(queued, report({ fingerprint: `fp${i}` }));
    }
    expect(queued).toHaveLength(MAX_QUEUED_REPORTS);
    // The newest survived; the oldest fell off.
    expect(queued[0].fingerprint).toBe(`fp${MAX_QUEUED_REPORTS + 9}`);
  });

  it('does not mutate the input array', () => {
    const existing = [report({ fingerprint: 'aaaa' })];
    queueCrashReport(existing, report({ fingerprint: 'bbbb' }));
    expect(existing).toHaveLength(1);
  });
});

describe('formatCrashReports', () => {
  it('says so when there is nothing to share', () => {
    expect(formatCrashReports([])).toBe('No crash reports.');
  });

  it('joins every report with a separator and carries the metadata line', () => {
    const text = formatCrashReports([
      report({ fingerprint: 'aaaa', message: 'first' }),
      report({ fingerprint: 'bbbb', message: 'second' }),
    ]);
    expect(text).toContain('first');
    expect(text).toContain('second');
    expect(text).toContain('---');
    expect(text).toContain('FATAL · v1.2.3 · android');
  });
});
