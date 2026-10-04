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
 * index. Anything that is not a letter, a digit or a space is stripped
 * first, so a stray character can never make the query throw — a property the
 * suite proves by running every query this module produces against a real FTS5
 * index.
 */

/** Shortest query that is worth handing to FTS5; below this we let LIKE scan. */
export const MIN_FTS_LENGTH = 3;

/**
 * Words FTS5 reads as operators when they appear in upper case.
 *
 * Left bare they either swallow the following `*` (`NEAR*`) or demand an operand
 * they do not have (`NOT` at the head of a query), which raises a syntax error
 * — and because the repository answers a caught error with an empty list, a
 * search for "milk AND eggs" would silently return nothing. Quoting turns each
 * back into an ordinary term: `"NOT"*` matches the word "not".
 */
const FTS5_KEYWORDS = /^(AND|OR|NOT|NEAR)$/;

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
    // Only letters, digits and whitespace reach FTS5. Everything else — its own
    // operators (`"`, `(`, `)`, `:`, `*`, `^`, `-`), apostrophes, emoji, stray
    // punctuation — becomes whitespace. Verified against real FTS5: a bare `'`
    // is a syntax error there, so `don't` must become `don* t*` (two tokens that
    // still match the indexed `don` + `t`) rather than `don't*`, which throws.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return null;
  // Tokens are already letter/digit only, so they can contain `"` — quoting is
  // always safe here.
  return tokens
    .map((token) => (FTS5_KEYWORDS.test(token) ? `"${token}"*` : `${token}*`))
    .join(' ');
}

/**
 * Should this query go to the FTS index at all? One- and two-character queries
 * are prefix noise (every row matches), so they take the LIKE path.
 */
export function shouldUseFts(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.length >= MIN_FTS_LENGTH && buildFtsQuery(trimmed) !== null;
}
