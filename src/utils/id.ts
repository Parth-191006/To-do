/**
 * Small id + time helpers. We avoid pulling in a uuid dependency
 * (and `crypto.randomUUID` is not available on every RN runtime) so we
 * compose a monotonic-ish, collision-resistant identifier locally.
 */

let counter = 0;

export function createId(prefix = ''): string {
  counter = (counter + 1) % 0xffff;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  const seq = counter.toString(36).padStart(3, '0');
  return `${prefix}${time}${rand}${seq}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Local calendar key `YYYY-MM-DD` — immune to UTC drift for streaks. */
export function toDateKey(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
