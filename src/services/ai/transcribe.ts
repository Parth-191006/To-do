import Constants from 'expo-constants';

/**
 * Speech-to-text for the voice quick-add.
 *
 * On-device transcription needs a platform STT module, so production builds
 * point `EXPO_PUBLIC_TRANSCRIBE_ENDPOINT` at a Supabase Edge Function that
 * proxies Whisper (or any compatible service). When it is not configured we
 * return `null` and the caller keeps the audio as an attachment instead of
 * silently dropping the user's input.
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
