import Constants from 'expo-constants';

import { bearerHeaders } from './authHeaders';
import { readBearerToken } from './session';

/**
 * Speech-to-text for the voice quick-add.
 *
 * On-device transcription needs a platform STT module, so production builds
 * point `EXPO_PUBLIC_TRANSCRIBE_ENDPOINT` at a Supabase Edge Function that
 * proxies Whisper (or any compatible service). When it is not configured we
 * return `null` and the caller keeps the audio as an attachment instead of
 * silently dropping the user's input.
 *
 * The endpoint is never an open proxy: it validates the caller's Supabase
 * token, applies a per-user quota and holds the provider key server-side (see
 * `supabase/functions/transcribe-audio`). Audio is the most expensive thing the
 * app can send, so it is the *least* appropriate thing to leave callable
 * anonymously.
 */

function resolveEndpoint(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_TRANSCRIBE_ENDPOINT;
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { transcribeEndpoint?: string } | undefined;
  return extra?.transcribeEndpoint ?? null;
}

export function isTranscriptionAvailable(): boolean {
  return resolveEndpoint() !== null;
}

export async function transcribeAudioFile(
  uri: string,
  options: { signal?: AbortSignal; language?: string } = {},
): Promise<string | null> {
  const endpoint = resolveEndpoint();
  if (!endpoint) return null;

  try {
    const form = new FormData();
    // React Native's FormData accepts a file descriptor object here; the DOM
    // typings do not model it, hence the cast.
    form.append('file', {
      uri,
      name: 'voice-note.m4a',
      type: 'audio/m4a',
    } as unknown as Blob);
    if (options.language) form.append('language', options.language);

    const response = await fetch(endpoint, {
      method: 'POST',
      // No Content-Type on purpose: the runtime sets the multipart boundary.
      headers: { ...bearerHeaders(await readBearerToken()) },
      body: form,
      signal: options.signal,
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { text?: unknown };
    return typeof payload.text === 'string' && payload.text.trim().length > 0
      ? payload.text.trim()
      : null;
  } catch {
    return null;
  }
}
