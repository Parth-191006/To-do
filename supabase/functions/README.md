# Supabase Edge Functions

Sample server-side pieces TaskFlow can talk to. Nothing here is required to use
the app — with no backend configured the app runs entirely on device.

| Function | Used by | Purpose |
| --- | --- | --- |
| [`ai-breakdown/`](ai-breakdown/) | **Break down with AI** | Authenticated, rate-limited proxy that holds the model key so it never ships in the APK. |
| [`transcribe-audio/`](transcribe-audio/) | **Voice capture** | Same four layers, its own per-user budget, and a size/type gate before any audio reaches the provider. |

Both functions refuse to run without a real user: an endpoint URL is public by
design (it is compiled into the bundle), so authentication — not obscurity — is
what keeps it from becoming an open proxy on someone else's bill. The app sends
its Supabase access token on every request (`src/services/ai/authHeaders.ts`),
and falls back to the on-device planner / keeps the recording as an attachment
when the answer is not a 2xx.

---

## `ai-breakdown` — why it exists

`EXPO_PUBLIC_*` values are **compiled into the JavaScript bundle**. Anyone who
downloads the APK can read them with a text editor, so a paid model key in
`EXPO_PUBLIC_AI_ENDPOINT` would be a key that is already spent.

The app therefore only knows a URL, and the URL points here:

```
client  ──POST {title, notes, priority, …}──▶  edge function  ──▶  model provider
        (Supabase access token)                (OPENAI_API_KEY,
                                                 never in the binary)
```

**The client still works with no network at all.** Any non-2xx answer — 401, 429,
502, a dead endpoint — makes `src/services/ai/breakdown.ts` fall back to its
on-device planner, which returns a plan in milliseconds. The remote model is an
upgrade, never a dependency.

### Request / response contract

```jsonc
// POST /functions/v1/ai-breakdown
{ "title": "Launch the site", "notes": "…", "estimateMinutes": 90,
  "priority": "high", "maxSteps": 5 }

// 200 OK
{ "steps": [
  { "title": "Freeze the scope", "estimateMinutes": 20, "priority": "high" },
  { "title": "Draft the copy",   "estimateMinutes": 45, "priority": "medium" },
  { "title": "Publish + announce","estimateMinutes": 25, "priority": "low" }
] }
```

Anything else is treated as "no answer" and the offline planner takes over.

### Four layers of defence

| # | Layer | What stops a stranger with the URL |
| --- | --- | --- |
| 1 | `verify_jwt` (on by default at deploy time) | Rejects requests with no/invalid Supabase JWT. |
| 2 | `admin.auth.getUser(token)` inside the function | Requires a *real* user, so the check cannot be skipped by hitting a non-gateway path. |
| 3 | `consume_ai_budget()` (migration [`0003`](../migrations/0003_ai_rate_limit.sql)) | 20 requests per user per minute by default, counted in Postgres; `service_role` only, so nobody can burn someone else's quota. |
| 4 | The model key itself | `OPENAI_API_KEY` is a Supabase **secret**, never `EXPO_PUBLIC_*`. |

### Deploy

```bash
# from the project root — supabase/config.toml not required for this function
supabase functions deploy ai-breakdown

# the model key, stored server-side only
supabase secrets set OPENAI_API_KEY=sk-… \
  AI_MODEL=gpt-4o-mini \
  AI_API_URL=https://api.openai.com/v1/chat/completions   # any OpenAI-compatible API

# the migrations above (schema + rate limiter)
supabase db push
```

`AI_API_URL` accepts any OpenAI-compatible chat-completions endpoint, so a
self-hosted or cheaper provider works by changing two secrets.

### Point the app at it

```bash
# .env  — the URL is public by design; the key is not.
EXPO_PUBLIC_AI_ENDPOINT=https://<project-ref>.functions.supabase.co/ai-breakdown
```

Signed-in users automatically send `Authorization: Bearer <access token>`, which
is what layers 1–3 validate. Signed out, the call is attempted anyway (so a proxy
that authenticates some other way still works) and the local planner answers if
it is refused.

### Check it

```bash
curl -X POST "https://<project-ref>.functions.supabase.co/ai-breakdown" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -d '{"title":"Write the quarterly report","priority":"high","maxSteps":5}'
# expect {"steps":[…]}   ·   expect 401 without the header   ·   expect 429 over the quota
```

---

## `transcribe-audio` — voice capture

Same shape, different input: `multipart/form-data` with the recording instead of
JSON, and an `Authorization: Bearer <Supabase access token>` header like every
other request the app makes to a proxy.

```jsonc
// POST /functions/v1/transcribe-audio   (multipart/form-data)
//   file      the recording (audio/*, ≤ 12 MB)
//   language  optional BCP-47 hint

// 200 OK
{ "text": "call the plumber tomorrow at nine" }
```

Anything else — 401, 413, 415, 429, 502 — makes
`src/services/ai/transcribe.ts` return `null`, and the caller keeps the audio as
an attachment on the task. A voice note is never dropped.

| # | Layer | What stops a stranger with the URL |
| --- | --- | --- |
| 1 | `verify_jwt` | Rejects requests with no/invalid Supabase JWT. |
| 2 | `admin.auth.getUser(token)` | Requires a *real* user, so the check cannot be skipped by hitting a non-gateway path. |
| 3 | `consume_api_budget(user, 'transcribe', limit)` | 6 requests per user per minute by default, in Postgres, `service_role` only — a separate bucket from the AI breakdown, because audio is what costs money per minute. |
| 4 | `OPENAI_API_KEY` + size and MIME gates | The key is a Supabase secret; the 12 MB cap and the audio-only allow-list are applied before the provider is called. |

```bash
supabase functions deploy transcribe-audio
supabase secrets set OPENAI_API_KEY=sk-… \
  TRANSCRIBE_MODEL=whisper-1 \
  TRANSCRIBE_API_URL=https://api.openai.com/v1/audio/transcriptions \
  TRANSCRIBE_RATE_LIMIT_PER_MINUTE=6
```

```bash
# .env — the URL is public by design; the key is not.
EXPO_PUBLIC_TRANSCRIBE_ENDPOINT=https://<project-ref>.functions.supabase.co/transcribe-audio
```

### Without Supabase

The same contract works with any proxy you host (Cloudflare Workers, a tiny
Node/Fastify service, an API gateway in front of the provider). Keep the four
layers — authentication, per-user rate limit, server-side key — and the app needs
no change: it only ever sees a URL.
