/**
 * FTS5 query building for task search.
 *
 * The `tasks_fts` index has always been maintained by triggers on `tasks`, but
 * nothing ever queried it: `searchTasks` ran a `LIKE '%…%'` scan instead, which
 * cannot use an index and made the README's "search (FTS5)" claim untrue. This
 * module is the pure half of the fix (no SQLite import, so it is unit-testable
 * under Node) — `@/db/repositories/tasks` runs the statement.
 *
 * Prefix matching is deliberate: the user types one character at a time, and
 * `report*` matches "reports", "reporting" and "reported" while still using the
 * index. Anything FTS5 treats as syntax (quotes, `-`, `*`, `:`, `(` …) is
 * stripped first so a stray character can never make the query throw.
 */

/** Shortest query that is worth handing to FTS5; below this we let LIKE scan. */
export const MIN_FTS_LENGTH = 3;

/**
 * Turns free text into a prefix-matching FTS5 expression.
 *
 * `"buy milk"` → `buy* milk*`
 *
 * Returns null when there is nothing indexable to search for (empty input, or
 * input that is entirely punctuation), which tells the caller to fall back to
 * a plain substring scan.
 */
export function buildFtsQuery(input: string): string | null {
  const tokens = input
    // FTS5 syntax characters + quoted phrases are a hazard, not a feature here.
    .replace(/["'^*:(){}[\]-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return null;
  return tokens.map((token) => `${token}*`).join(' ');
}

/**
 * Should this query go to the FTS index at all? One- and two-character queries
 * are prefix noise (every row matches), so they take the LIKE path.
 */
export function shouldUseFts(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.length >= MIN_FTS_LENGTH && buildFtsQuery(trimmed) !== null;
}
