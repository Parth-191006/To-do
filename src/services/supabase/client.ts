import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

/**
 * Supabase adapter.
 *
 * The app is offline-first: SQLite is always the source of truth on device and
 * Supabase is a *replication target* plus the auth/collaboration backend. When
 * the environment is not configured (a fresh clone, a demo build, tests) every
 * helper degrades to a no-op so the app runs perfectly well with zero backend.
 *
 * Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No URL-based sessions in a native app.
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 5 },
      },
    });
  }
  return client;
}

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function signInWithOtp(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase is not configured on this build.' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Bring the magic link back into the app instead of a browser tab.
      emailRedirectTo: Linking.createURL('/'),
    },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

/** The signed-in user's email, or null when signed out / unconfigured. */
export async function getSessionEmail(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

/** Fires whenever the auth session changes (sign-in link opened, token refreshed, sign-out). */
export function subscribeToAuthChanges(onChange: () => void): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(() => onChange());
  return () => data.subscription.unsubscribe();
}

/**
 * Consumes the redirect the magic link opened the app with.
 * Handles both flows: PKCE (`?code=`) and implicit (`#access_token=…`).
 * Returns true when a session was established, so the caller can refresh.
 */
export async function completeSignInFromUrl(url: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const parsed = new URL(url);

    const code = parsed.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return !error;
    }

    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return !error;
    }
  } catch {
    // Malformed redirect — leave the user signed out rather than crash.
  }
  return false;
}

/**
 * Realtime subscription used for shared-list collaboration: other members'
 * writes land in Postgres and are streamed back so open lists update live.
 */
export function subscribeToProjectChanges(
  projectId: string,
  onChange: () => void,
): () => void {
  const supabase = getSupabase();
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel(`project:${projectId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
