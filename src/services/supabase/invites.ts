import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

import { looksLikeInviteToken } from '@/domain/invites';

import { getCurrentUserId, getSupabase, isSupabaseConfigured } from './client';

/**
 * List invites — the client half of migration 0006.
 *
 * The token is the credential: it is minted server-side, carried in a
 * `taskflow://join/<token>` link and consumed by a SECURITY DEFINER function
 * that checks expiry, single use and (when set) the invited email. This module
 * never builds a token and never writes membership directly — that would move
 * the privilege check into the client, where a patched build could skip it.
 *
 * Every helper degrades honestly when no backend is configured: `null` out,
 * never a fake success.
 */

const PENDING_INVITE_KEY = 'taskflow.invite.pendingToken';

/** The deep link for a token, in whatever runtime is hosting us. */
export function inviteUrlForToken(token: string): string {
  // In a standalone build this is `taskflow://join/<token>`; under the Expo
  // dev client it is the dev-server URL, which is exactly what you want when
  // testing the flow without an APK.
  return Linking.createURL(`join/${token}`);
}

/**
 * Mints an invite for a list the caller may edit.
 * Returns the token, or null when it could not be created (offline, signed
 * out, no backend) — the caller then falls back to a plain download link
 * instead of emailing a dead URL.
 */
export async function createListInvite(
  projectId: string,
  email?: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  if (!(await getCurrentUserId())) return null;

  const { data, error } = await supabase.rpc('create_list_invite', {
    p_project_id: projectId,
    p_email: email ?? null,
  });
  if (error || typeof data !== 'string' || !looksLikeInviteToken(data)) return null;
  return data;
}

export type AcceptInviteResult =
  | { ok: true; projectId: string }
  | { ok: false; reason: 'not-configured' | 'not-found' | 'expired' | 'used' | 'wrong-email' | 'unknown' };

/**
 * Consumes an invite token. The RPC is idempotent for the person who already
 * accepted, so re-opening a link after success simply lands on the list again.
 */
export async function acceptListInvite(token: string): Promise<AcceptInviteResult> {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not-configured' };
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not-configured' };
  if (!(await getCurrentUserId())) return { ok: false, reason: 'unknown' };
  if (!looksLikeInviteToken(token)) return { ok: false, reason: 'not-found' };

  const { data, error } = await supabase.rpc('accept_list_invite', { p_token: token });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('already used')) return { ok: false, reason: 'used' };
    if (message.includes('expired')) return { ok: false, reason: 'expired' };
    if (message.includes('different email')) return { ok: false, reason: 'wrong-email' };
    if (message.includes('not found')) return { ok: false, reason: 'not-found' };
    return { ok: false, reason: 'unknown' };
  }
  if (typeof data !== 'string' || data.length === 0) return { ok: false, reason: 'unknown' };
  return { ok: true, projectId: data };
}

/**
 * The logged-out handoff.
 *
 * An invite link can arrive before the invitee has an account. Rather than
 * dropping it (the link is single-use and they may never re-find the email),
 * the token is parked on disk and replayed the moment sign-in completes — the
 * root layout drains it after the magic-link redirect establishes a session.
 */
export async function stashPendingInvite(token: string): Promise<void> {
  if (!looksLikeInviteToken(token)) return;
  await AsyncStorage.setItem(PENDING_INVITE_KEY, token).catch(() => undefined);
}

export async function peekPendingInvite(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PENDING_INVITE_KEY).catch(() => null);
  return looksLikeInviteToken(token) ? token : null;
}

/** Reads and clears the parked invite — call once, after sign-in. */
export async function drainPendingInvite(): Promise<string | null> {
  const token = await peekPendingInvite();
  if (token) await AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => undefined);
  return token;
}

/** Forget a parked invite the user chose not to accept. */
export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => undefined);
}
