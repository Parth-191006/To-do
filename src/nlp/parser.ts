/**
 * TaskFlow natural-language task parser.
 *
 * Turns a single free-text line into a structured task draft — dates, times,
 * tags, projects, priority, recurrence and time estimates — with zero taps on
 * a date picker. Written by hand (no runtime dependency) so it is fast enough
 * to run on every keystroke and works fully offline.
 *
 *   "Submit project report tomorrow at 5pm #Work !high ~45m"
 *     → title:  "Submit project report"
 *       dueAt:  tomorrow 17:00
 *       tags:   ["Work"]
 *       priority: high
 *       estimateMinutes: 45
 *
 * Every recognised fragment is returned as a `token` with its character span,
 * which is what the Smart Input highlights inline as the user types.
 */

import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addWeeks,
  isBefore,
  startOfDay,
} from 'date-fns';

import type { ParsedTask, ParsedToken, Priority, Recurrence } from '@/domain/types';

interface Span {
  start: number;
  end: number;
}

interface TokenMatch<T = undefined> extends Span {
  kind: ParsedToken['kind'];
  text: string;
  label: string;
  value: T;
}

interface TimeValue {
  hours: number;
  minutes: number;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const WEEKDAY_LABEL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8,
  sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const PRIORITY_WORDS: Record<string, Priority> = {
  urgent: 'urgent',
  asap: 'urgent',
  high: 'high',
  medium: 'medium',
  normal: 'medium',
  low: 'low',
  none: 'none',
};

const PRIORITY_BY_DIGIT: Priority[] = ['urgent', 'high', 'medium', 'low'];

const PRIORITY_RANK: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

class SpanSet {
  private spans: Span[] = [];

  overlaps(start: number, end: number): boolean {
    return this.spans.some((s) => start < s.end && end > s.start);
  }

  add(start: number, end: number): void {
    this.spans.push({ start, end });
  }

  get all(): Span[] {
    return this.spans;
  }
}

/** Runs a global regex and returns each non-overlapping recognised match. */
function scan<T>(
  input: string,
  regex: RegExp,
  consumed: SpanSet,
  handler: (match: RegExpExecArray) => { kind: ParsedToken['kind']; label: string; value: T } | null,
): TokenMatch<T>[] {
  const results: TokenMatch<T>[] = [];
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const start = match.index;
    const end = start + match[0].length;
    if (consumed.overlaps(start, end)) continue;
    const handled = handler(match);
    if (!handled) continue;
    consumed.add(start, end);
    results.push({ ...handled, text: match[0], start, end });
  }
  return results;
}

function nextWeekday(target: number, now: Date, forceNext = false): Date {
  const diff = (target - now.getDay() + 7) % 7;
  const days = forceNext ? diff + 7 : diff === 0 ? 7 : diff;
  return addDays(startOfDay(now), days);
}

function resolveWeekday(name: string, modifier: string, now: Date): Date {
  const target = WEEKDAYS[name.toLowerCase()] ?? 0;
  return nextWeekday(target, now, modifier.trim().toLowerCase().startsWith('next'));
}

/**
 * Time-of-day implied by words like "tonight" or "this afternoon". Used when
 * the user gives an hour-less time reference, so the reminder lands somewhere
 * sensible instead of at midnight.
 */
function resolveKeywordTime(input: string): TimeValue | null {
  if (/\btonight\b/i.test(input)) return { hours: 20, minutes: 0 };
  const match = /\bthis\s+(morning|afternoon|evening)\b/i.exec(input);
  if (!match) return null;
  const word = match[1].toLowerCase();
  if (word === 'morning') return { hours: 9, minutes: 0 };
  if (word === 'afternoon') return { hours: 14, minutes: 0 };
  return { hours: 19, minutes: 0 };
}

/** Phrases whose implied day is \"today-ish\" and should roll forward if past. */
const RELATIVE_DAY = /\b(today|tonight|this\s+(?:morning|afternoon|evening))\b/i;

function midnightsBetween(date: Date, now: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

function labelForDate(date: Date, now: Date): string {
  const delta = midnightsBetween(date, now);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  if (delta > 1 && delta < 7) return WEEKDAY_LABEL[date.getDay()];
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatTime(hours: number, minutes: number): string {
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? 'AM' : 'PM';
  return `${h12}:${`${minutes}`.padStart(2, '0')} ${suffix}`;
}

export interface ParseOptions {
  /** Reference "now" — injectable for deterministic tests. */
  now?: Date;
}

export function parseTaskInput(rawInput: string, options: ParseOptions = {}): ParsedTask {
  const now = options.now ?? new Date();
  const input = rawInput ?? '';
  const consumed = new SpanSet();

  // ---------------------------------------------------------------- priority
  const priorityMatches: TokenMatch<Priority>[] = [
    ...scan<Priority>(input, /!\s*(urgent|high|medium|normal|low|none|asap)\b/gi, consumed, (m) => {
      const level = PRIORITY_WORDS[m[1].toLowerCase()] ?? 'none';
      return { kind: 'priority', label: `${capitalize(level)} priority`, value: level };
    }),
    ...scan<Priority>(input, /!\s*([1-4])\b/g, consumed, (m) => {
      const level = PRIORITY_BY_DIGIT[Number(m[1]) - 1];
      return { kind: 'priority', label: `${capitalize(level)} priority`, value: level };
    }),
    ...scan<Priority>(input, /\bp\s*([1-4])\b/gi, consumed, (m) => {
      const level = PRIORITY_BY_DIGIT[Number(m[1]) - 1];
      return { kind: 'priority', label: `${capitalize(level)} priority`, value: level };
    }),
    ...scan<Priority>(input, /!{3}/g, consumed, () => ({
      kind: 'priority',
      label: 'Urgent priority',
      value: 'urgent' as Priority,
    })),
    ...scan<Priority>(input, /!{2}/g, consumed, () => ({
      kind: 'priority',
      label: 'High priority',
      value: 'high' as Priority,
    })),
    ...scan<Priority>(input, /!/g, consumed, () => ({
      kind: 'priority',
      label: 'Medium priority',
      value: 'medium' as Priority,
    })),
  ];

  // -------------------------------------------------------------------- tags
  const tagMatches = scan<string>(input, /#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu, consumed, (m) => ({
    kind: 'tag',
    label: `#${m[1]}`,
    value: m[1],
  }));

  // ---------------------------------------------------------------- projects
  const projectMatches = scan<string>(input, /@([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu, consumed, (m) => ({
    kind: 'project',
    label: `@${m[1]}`,
    value: m[1],
  }));

  // -------------------------------------------------------------- recurrence
  const recurrenceMatches: TokenMatch<Recurrence>[] = [
    ...scan<Recurrence>(
      input,
      /\bevery\s+(day|week|month|year|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      consumed,
      (m) => {
        const value = buildRecurrence(m[1].toLowerCase());
        return { kind: 'recurrence', label: describeRecurrence(value), value };
      },
    ),
    ...scan<Recurrence>(input, /\b(daily|weekly|monthly|yearly|annually)\b/gi, consumed, (m) => {
      const value = buildRecurrence(m[1].toLowerCase());
      return { kind: 'recurrence', label: describeRecurrence(value), value };
    }),
  ];

  // ---------------------------------------------------------------- estimate
  const hourMatches = scan<number>(
    input,
    /~\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b/gi,
    consumed,
    (m) => {
      const minutes = Math.round(Number(m[1]) * 60);
      return { kind: 'estimate', label: `${minutes}m estimate`, value: minutes };
    },
  );
  const minuteMatches = scan<number>(
    input,
    /~\s*(\d+)\s*(?:m|min|mins|minutes?)\b/gi,
    consumed,
    (m) => {
      const minutes = Number(m[1]);
      return { kind: 'estimate', label: `${minutes}m estimate`, value: minutes };
    },
  );

  // ------------------------------------------------------------- date + time
  const timeMatches: TokenMatch<TimeValue>[] = [
    ...scan<TimeValue>(input, /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, consumed, (m) => {
      let hours = Number(m[1]) % 12;
      if (m[3].toLowerCase() === 'pm') hours += 12;
      const minutes = m[2] ? Number(m[2]) : 0;
      return { kind: 'time', label: formatTime(hours, minutes), value: { hours, minutes } };
    }),
    ...scan<TimeValue>(input, /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/g, consumed, (m) => {
      const value = { hours: Number(m[1]), minutes: Number(m[2]) };
      return { kind: 'time', label: formatTime(value.hours, value.minutes), value };
    }),
    ...scan<TimeValue>(input, /\b(?:at\s+)?(noon|midday|midnight)\b/gi, consumed, (m) => {
      const value = m[1].toLowerCase() === 'midnight' ? { hours: 0, minutes: 0 } : { hours: 12, minutes: 0 };
      return { kind: 'time', label: formatTime(value.hours, value.minutes), value };
    }),
  ];

  const dateMatches: TokenMatch<Date>[] = [
    ...scan<Date>(
      input,
      /\bin\s+\d+\s+(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\b/gi,
      consumed,
      (m) => {
        const quantity = Number(/(\d+)/.exec(m[0])?.[1] ?? '0');
        const unit = m[0].toLowerCase();
        let date: Date;
        if (unit.includes('min')) date = addMinutes(now, quantity);
        else if (unit.includes('hour') || unit.includes('hr')) date = addHours(now, quantity);
        else if (unit.includes('week')) date = addWeeks(now, quantity);
        else if (unit.includes('month')) date = addMonths(now, quantity);
        else date = addDays(now, quantity);
        return { kind: 'date', label: labelForDate(date, now), value: date };
      },
    ),
    // `yesterday` belongs here too: without it "email the invoice yesterday"
    // kept the word in the title and — worse — still matched the bare time
    // ("5pm"), so a forgotten task silently rescheduled itself to *later".
    ...scan<Date>(input, /\b(today|tonight|tomorrow|yesterday)\b/gi, consumed, (m) => {
      const word = m[1].toLowerCase();
      const offset = word === 'tomorrow' ? 1 : word === 'yesterday' ? -1 : 0;
      const date = offset === 0 ? now : addDays(now, offset);
      return { kind: 'date', label: labelForDate(date, now), value: date };
    }),
    ...scan<Date>(
      input,
      /\b(next\s+|this\s+|coming\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thu|thurs|thur|fri|sat)\b/gi,
      consumed,
      (m) => {
        const date = resolveWeekday(m[2], m[1] ?? '', now);
        const prefix = m[1] ? `${capitalize(m[1].trim())} ` : '';
        return { kind: 'date', label: `${prefix}${WEEKDAY_LABEL[date.getDay()]}`, value: date };
      },
    ),
    ...scan<Date>(input, /\b(next|this)\s+(week|month|year)\b/gi, consumed, (m) => {
      const isNext = m[1].toLowerCase() === 'next';
      const unit = m[2].toLowerCase();
      const date =
        unit === 'week'
          ? addWeeks(now, isNext ? 1 : 0)
          : unit === 'month'
            ? addMonths(now, isNext ? 1 : 0)
            : addMonths(now, isNext ? 12 : 0);
      return { kind: 'date', label: labelForDate(date, now), value: date };
    }),
    ...scan<Date>(input, /\bthis\s+(?:morning|afternoon|evening)\b/gi, consumed, () => ({
      kind: 'date',
      label: 'Today',
      value: now,
    })),
    ...scan<Date>(input, /\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, consumed, (m) => {
      // Groups: 1 = month, 2 = day, 3 = optional year.
      const month = Number(m[1]) - 1;
      const day = Number(m[2]);
      let year = m[3] ? Number(m[3]) : now.getFullYear();
      if (year < 100) year += 2000;
      const candidate = new Date(year, month, day);
      const date = !m[3] && isBefore(candidate, startOfDay(now)) ? addMonths(candidate, 12) : candidate;
      return { kind: 'date', label: labelForDate(date, now), value: date };
    }),
    ...scan<Date>(input, /\b(\d{4})-(\d{2})-(\d{2})\b/g, consumed, (m) => {
      const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return { kind: 'date', label: labelForDate(date, now), value: date };
    }),
    ...scan<Date>(
      input,
      /\b(?:on\s+)?(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi,
      consumed,
      (m) => {
        const month = MONTHS[m[1].toLowerCase()] ?? 0;
        const day = Number(m[2]);
        const candidate = new Date(now.getFullYear(), month, day);
        const date = isBefore(candidate, startOfDay(now))
          ? new Date(now.getFullYear() + 1, month, day)
          : candidate;
        return { kind: 'date', label: labelForDate(date, now), value: date };
      },
    ),
  ];

  const allTokens = [
    ...priorityMatches,
    ...tagMatches,
    ...projectMatches,
    ...recurrenceMatches,
    ...hourMatches,
    ...minuteMatches,
    ...timeMatches,
    ...dateMatches,
  ];

  // --------------------------------------------------------------- finalize
  const priority = priorityMatches.reduce<Priority>(
    (acc, match) => rankPriority(acc, match.value),
    'none',
  );
  const recurrence = recurrenceMatches.length > 0 ? recurrenceMatches[0].value : null;
  const estimateMinutes = hourMatches.length
    ? hourMatches[0].value
    : minuteMatches.length
      ? minuteMatches[0].value
      : null;
  let explicitDate = dateMatches.length > 0 ? dateMatches[dateMatches.length - 1].value : null;
  const explicitTime =
    timeMatches.length > 0 ? timeMatches[timeMatches.length - 1].value : resolveKeywordTime(input);

  // A recurrence with no explicit date still needs an anchor, otherwise a
  // repeating task scheduled "every monday" would never fire.
  if (!explicitDate && recurrence) {
    if (recurrence.frequency === 'daily') {
      explicitDate = now;
    } else if (recurrence.frequency === 'weekly' && recurrence.byWeekday?.length) {
      explicitDate = nextWeekday(recurrence.byWeekday[0], now);
    }
  }

  let dueAt: string | null = null;
  if (explicitDate) {
    const date = new Date(explicitDate);
    if (explicitTime) {
      date.setHours(explicitTime.hours, explicitTime.minutes, 0, 0);
    } else {
      date.setHours(9, 0, 0, 0);
    }
    // "tonight" said at 11pm should mean tomorrow, not a past timestamp.
    if (isBefore(date, now) && RELATIVE_DAY.test(input)) {
      date.setDate(date.getDate() + 1);
    }
    dueAt = date.toISOString();
  } else if (explicitTime) {
    const date = new Date(now);
    date.setHours(explicitTime.hours, explicitTime.minutes, 0, 0);
    if (isBefore(date, now)) date.setDate(date.getDate() + 1);
    dueAt = date.toISOString();
  }

  let remindAt: string | null = null;
  if (dueAt) {
    const due = new Date(dueAt);
    const lead = new Date(due.getTime() - 30 * 60 * 1000);
    remindAt = (isBefore(lead, now) ? due : lead).toISOString();
  }

  return {
    title: stripSpans(input, consumed.all),
    dueAt,
    remindAt,
    priority,
    tags: tagMatches.map((m) => m.value),
    projectHint: projectMatches.length > 0 ? projectMatches[0].value : null,
    recurrence,
    estimateMinutes,
    tokens: allTokens
      .sort((a, b) => a.start - b.start)
      .map(({ kind, text, start, end, label }) => ({ kind, text, start, end, label })),
  };
}

/** Removes every recognised span and tidies the leftover whitespace. */
export function stripSpans(input: string, spans: Span[]): string {
  if (spans.length === 0) return input.replace(/\s+/g, ' ').trim();
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const span of sorted) {
    if (span.start > cursor) out += input.slice(cursor, span.start);
    cursor = Math.max(cursor, span.end);
  }
  out += input.slice(cursor);
  return out
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:.\-]+|[\s,;:\-]+$/g, '')
    .trim();
}

/** Keeps the most severe priority when a string contains several markers. */
function rankPriority(current: Priority, next: Priority): Priority {
  return PRIORITY_RANK[next] > PRIORITY_RANK[current] ? next : current;
}

function buildRecurrence(word: string): Recurrence {
  if (word in WEEKDAYS) {
    return { frequency: 'weekly', interval: 1, byWeekday: [WEEKDAYS[word]] };
  }
  switch (word) {
    case 'week':
    case 'weekly':
      return { frequency: 'weekly', interval: 1 };
    case 'month':
    case 'monthly':
      return { frequency: 'monthly', interval: 1 };
    case 'year':
    case 'yearly':
    case 'annually':
      return { frequency: 'yearly', interval: 1 };
    default:
      return { frequency: 'daily', interval: 1 };
  }
}

export function describeRecurrence(recurrence: Recurrence | null): string {
  if (!recurrence) return '';
  const plural = recurrence.interval > 1 ? `Every ${recurrence.interval} ` : '';
  switch (recurrence.frequency) {
    case 'daily':
      return recurrence.interval > 1 ? `${plural}days` : 'Every day';
    case 'weekly': {
      const days = recurrence.byWeekday?.length
        ? recurrence.byWeekday.map((d) => WEEKDAY_LABEL[d]).join(', ')
        : null;
      if (days) return recurrence.interval > 1 ? `${plural}weeks on ${days}` : `Weekly on ${days}`;
      return recurrence.interval > 1 ? `${plural}weeks` : 'Weekly';
    }
    case 'monthly':
      return recurrence.interval > 1 ? `${plural}months` : 'Monthly';
    case 'yearly':
      return recurrence.interval > 1 ? `${plural}years` : 'Yearly';
    default:
      return '';
  }
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
