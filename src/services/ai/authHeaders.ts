/**
 * The auth header for the remote AI endpoints.
 *
 * Both callers — the breakdown proxy and the transcription proxy — are Edge
 * Functions that refuse to run without a real Supabase user, so every request
 * must carry the caller's access token. Isolating the header here keeps the
 * "who is asking" decision in one place, and keeps it free of imports so it can
 * be unit-tested without a network or a native module.
 *
 * A missing token is not an error: it produces no header, the function answers
 * 401, and the caller falls back (the on-device planner, or keeping the audio
 * as an attachment). What it must never do is invent a value — an empty
 * `Authorization: Bearer` header is rejected by the gateway before the function
 * even runs, which reads as "broken endpoint" instead of "signed out".
 */
export function bearerHeaders(token: string | null | undefined): Record<string, string> {
  const value = typeof token === 'string' ? token.trim() : '';
  return value ? { Authorization: `Bearer ${value}` } : {};
}
