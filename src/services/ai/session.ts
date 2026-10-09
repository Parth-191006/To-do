import { getSupabase } from '@/services/supabase/client';

/**
 * The signed-in user's Supabase access token, or null.
 *
 * Signed out — or with no backend configured at all — there is nothing to send.
 * The AI endpoints require a user, so the call is made without a header and the
 * 401 that comes back is handled by the caller's fallback path. With Supabase
 * enabled but no mail-link sign-in yet (anonymous local use), that is the normal
 * case and the app stays fully offline-first.
 */
export async function readBearerToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
