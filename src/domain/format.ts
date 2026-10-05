/**
 * Formatting helpers for human-facing numbers.
 *
 * Kept in `domain/` (no React Native imports) so the rules stay unit-testable:
 * the Insights tiles used to round focus time to whole hours, which printed
 * "0h" next to a real 25-minute session.
 */

/** "45s" under a minute, "42m" under an hour, "3.5h" above it — never "0h" for a real session. */
export function formatHours(seconds: number): string {
  if (seconds <= 0) return '0h';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  // Rounded minutes decide the unit, so 59m40s reads "1.0h" rather than "60m".
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
