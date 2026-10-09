/**
 * TaskFlow · `transcribe-audio`
 *
 * The remote half of voice capture: it turns a recorded voice note into text.
 *
 * It exists for the same reason `ai-breakdown` does — the provider key must not
 * ship inside the app — but audio deserves its own function rather than a second
 * branch in that one:
 *
 *   - It is the most expensive thing the app can send (providers bill per
 *     minute of audio), so it gets its own per-user budget instead of sharing
 *     the breakdown quota.
 *   - Its input is a file, so the size and type have to be bounded *before* the
 *     body is read into memory.
 *
 * Contract with the client (`src/services/ai/transcribe.ts`):
 *
 *     POST   multipart/form-data  { file: <audio>, language?: <bcp-47> }
 *     200    { text: "…" }
 *
 * Every non-2xx answer makes the app keep the recording as an audio attachment
 * on the task, so a voice note is never silently lost.
 *
 * Four layers, outermost first:
 *   1. JWT verification — Supabase's `verify_jwt`, on by default.
 *   2. User resolution   — the bearer token must belong to a real user, so a
 *                          URL leaked from the binary is not an open proxy.
 *   3. Rate limit        — `consume_api_budget(user, 'transcribe', limit)`,
 *                          migration 0005, service-role only.
 *   4. Provider call     — `OPENAI_API_KEY` (or any Whisper-compatible key)
 *                          lives here and nowhere else.
 *
 * Deploy:
 *     supabase functions deploy transcribe-audio
 *     supabase secrets set OPENAI_API_KEY=sk-…   [TRANSCRIBE_MODEL=… TRANSCRIBE_API_URL=…]
 *
 * Full walkthrough: supabase/functions/README.md
 */
import { createClient } from "npm:@supabase/supabase-js@2";

/** ~8 minutes of m4a at 128 kbps. Longer than any task note needs to be. */
const MAX_BYTES = 12 * 1024 * 1024;
const RATE_LIMIT_PER_MINUTE = Number(Deno.env.get("TRANSCRIBE_RATE_LIMIT_PER_MINUTE") ?? "6");
const MODEL_TIMEOUT_MS = 60_000;
const MAX_TRANSCRIPT_CHARS = 4000;

/**
 * Formats the clients actually record. An unknown type is refused rather than
 * forwarded, so the endpoint cannot be used to smuggle arbitrary binaries to a
 * provider on someone else's bill.
 */
const ALLOWED_TYPES = new Set([
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "application/octet-stream",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ALLOW_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return respond({ error: "method_not_allowed" }, 405);
  }

  // --- layer 1 + 2: who is calling? ------------------------------------------
  const token = (request.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "");
  if (!token) return respond({ error: "unauthenticated" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return respond({ error: "not_configured" }, 503);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return respond({ error: "unauthenticated" }, 401);

  // --- layer 3: the caller's own budget, spent before any bytes are read -----
  const { data: allowed, error: budgetError } = await admin.rpc("consume_api_budget", {
    p_user_id: auth.user.id,
    p_bucket: "transcribe",
    p_limit: RATE_LIMIT_PER_MINUTE,
  });
  if (budgetError) return respond({ error: "rate_limiter_unavailable" }, 500);
  if (allowed !== true) return respond({ error: "rate_limited", retry_after: 60 }, 429);

  // Cheap gate first: a declared oversized upload is refused before the body is
  // materialised in memory.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES + 8192) {
    return respond({ error: "payload_too_large", max_bytes: MAX_BYTES }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond({ error: "invalid_form_data" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return respond({ error: "missing_file" }, 400);
  if (file.size === 0) return respond({ error: "empty_file" }, 400);
  if (file.size > MAX_BYTES) {
    return respond({ error: "payload_too_large", max_bytes: MAX_BYTES }, 413);
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return respond({ error: "unsupported_type", type: file.type }, 415);
  }

  const language = typeof form.get("language") === "string" ? String(form.get("language")) : "";
  if (language.length > 8 || !/^[a-zA-Z-]*$/.test(language)) {
    return respond({ error: "invalid_language" }, 400);
  }

  // --- layer 4: the provider --------------------------------------------------
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return respond({ error: "not_configured" }, 503);

  const apiUrl =
    Deno.env.get("TRANSCRIBE_API_URL") ?? "https://api.openai.com/v1/audio/transcriptions";
  const model = Deno.env.get("TRANSCRIBE_MODEL") ?? "whisper-1";

  const upstream = new FormData();
  upstream.append("file", file, file.name || "voice-note.m4a");
  upstream.append("model", model);
  upstream.append("response_format", "json");
  if (language) upstream.append("language", language);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: upstream,
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Never echo the provider's body: it can contain the request, and the
      // request is the user's audio transcript.
      return respond({ error: "upstream_error", status: response.status }, 502);
    }

    const payload = (await response.json()) as { text?: unknown };
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return respond({ error: "empty_transcript" }, 502);

    return respond({ text: text.slice(0, MAX_TRANSCRIPT_CHARS) }, 200);
  } catch {
    return respond({ error: "upstream_unavailable" }, 502);
  }
});
