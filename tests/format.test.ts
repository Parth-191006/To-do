/**
 * Duration formatting suite.
 *
 * The Insights focus tile rounded to whole hours, so a 25-minute session showed
 * "0h" — the same screen already used the sub-hour form for its weekly card, so
 * the two disagreed about the same data.
 */
import { describe, expect, it } from 'vitest';

import { formatHours } from '@/domain/format';

describe('formatHours', () => {
  it('reports whole hours with one decimal', () => {
    expect(formatHours(3600)).toBe('1.0h');
    expect(formatHours(3600 * 3.5)).toBe('3.5h');
  });

  it('reports minutes under an hour instead of collapsing to 0h', () => {
    expect(formatHours(60)).toBe('1m');
    expect(formatHours(25 * 60)).toBe('25m');
    expect(formatHours(42 * 60 + 20)).toBe('42m');
  });

  it('reports seconds under a minute', () => {
    expect(formatHours(45)).toBe('45s');
  });

  it('promotes an almost-hour to hours rather than printing 60m', () => {
    expect(formatHours(59 * 60 + 40)).toBe('1.0h');
  });

  it('only ever says 0h for a genuinely empty day', () => {
    expect(formatHours(0)).toBe('0h');
    expect(formatHours(-5)).toBe('0h');
  });
});
