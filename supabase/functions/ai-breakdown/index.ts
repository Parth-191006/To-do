/**
 * TaskFlow · `ai-breakdown`
 *
 * The remote half of "Break down with AI".
 *
 * It exists so no model key can ever ship inside the app. Every `EXPO_PUBLIC_*`
 * value is compiled into the JS bundle and is readable by anyone who downloads
 * the APK — a paid key there is a key that is already spent. The app therefore
 * only ever knows a URL; this function holds the secret.
 *
 * Contract with the client (`src/services/ai/breakdown.ts`):
 *
 *     POST   { title, notes, estimateMinutes, priority, maxSteps }
 *     200    { steps: [{ title, estimateMinutes, priority }, …] }   3–5 entries
 *
 * Every non-2xx answer (401 unauthenticated, 429 rate-limited, 502 upstream
 * trouble) makes the app fall back to its on-device planner, so the feature
 * works with no network at all.
 *
 * Four layers, outermost first:
 *   1. JWT verification — Supabase's `verify_jwt`, which is on by default.
 *   2. User resolution   — the bearer token must belong to a real user; this
 *                          function refuses to run without one, so an endpoint
 *                          URL leaked from the binary is not an open proxy.
 *   3. Rate limit        — `consume_ai_budget()`, a fixed per-minute, per-user
 *                          counter in Postgres (migration 0003), service-role
 *                          only so nobody can burn someone else's quota.
 *   4. Model call        — `OPENAI_API_KEY`, a *secret*, lives here and nowhere
 *                          else. It is never an EXPO_PUBLIC_ variable.
 *
 * Deploy:
 *     supabase functions deploy ai-breakdown
 *     supabase secrets set OPENAI_API_KEY=sk-…   [AI_MODEL=… AI_API_URL=…]
 *
 * Full walkthrough: supabase/functions/README.md
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
type Priority = (typeof PRIORITIES)[number];

const MAX_TITLE_LENGTH = 400;
const MAX_NOTES_LENGTH = 2000;
const MAX_STEPS_HARD_CAP = 5;
const MIN_STEPS = 3;
const MIN_ESTIMATE_MINUTES = 5;
const MAX_ESTIMATE_MINUTES = 480;
const MODEL_TIMEOUT_MS = 20_000;

const RATE_LIMIT_PER_MINUTE = Number(Deno.env.get("AI_RATE_LIMIT_PER_MINUTE") ?? "20");

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

/** Everything the model is allowed to influence, already validated. */
interface PlanRequest {
  title: string;
  notes: string;
  estimateMinutes: number | null;
  priority: Priority;
  maxSteps: number;
}

interface PlannedStep {
  title: string;
  estimateMinutes: number | null;
  priority: Priority;
}

function asPriority(value: unknown): Priority {
  return (PRIORITIES as readonly string[]).includes(value as string)
    ? (value as Priority)
    : "medium";
}

/** Validates the body and clamps it — the endpoint is public, nothing is trusted. */
function readPlanRequest(raw: unknown): PlanRequest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;

  if (typeof body.title !== "string" || body.title.trim().length === 0) return null;
  if (body.title.length > MAX_TITLE_LENGTH) return null;

  const notes = typeof body.notes === "string" ? body.notes : "";
  if (notes.length > MAX_NOTES_LENGTH) return null;

  const estimate =
    typeof body.estimateMinutes === "number" && Number.isFinite(body.estimateMinutes)
      ? Math.min(MAX_ESTIMATE_MINUTES, Math.max(MIN_ESTIMATE_MINUTES, Math.round(body.estimateMinutes)))
      : null;

  const requested = typeof body.maxSteps === "number" ? Math.round(body.maxSteps) : MAX_STEPS_HARD_CAP;
  const maxSteps = Math.min(MAX_STEPS_HARD_CAP, Math.max(MIN_STEPS, requested));

  return {
    title: body.title.trim(),
    notes,
    estimateMinutes: estimate,
    priority: asPriority(body.priority),
    maxSteps,
  };
}

/** The shared instruction. Deliberately short: the app clamps whatever comes back. */
const SYSTEM_PROMPT = [
  "You break one task into 3 to 5 concrete, independently checkable subtasks.",
  "Each subtask is a small action that can be started immediately — not a topic.",
  "Give each one an estimate in minutes (5 to 480, null only when genuinely unknowable)",
  "and a priority: none, low, medium, high or urgent. The first subtask should",
  "unblock the rest, so it is at least as urgent as the parent; the last is wrap-up.",
  'Reply with JSON only: {"steps":[{"title":"…","estimateMinutes":25,"priority":"high"}]}',
].join(" ");

/** Tolerant JSON extraction: some models still wrap output in fences or prose. */
function parseSteps(text: string, maxSteps: number): PlannedStep[] | null {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();

  const candidates: string[] = [stripped];
  const open = stripped.indexOf("{");
  const close = stripped.lastIndexOf("}");
  if (open !== -1 && close > open) candidates.push(stripped.slice(open, close + 1));

  let payload: unknown = null;
  for (const candidate of candidates) {
    try {
      payload = JSON.parse(candidate);
      break;
    } catch {
      // try the next candidate
    }
  }
  if (typeof payload !== "object" || payload === null) return null;

  const raw = (payload as { steps?: unknown }).steps;
  if (!Array.isArray(raw)) return null;

  const steps: PlannedStep[] = [];
  for (const entry of raw) {
    if (steps.length >= maxSteps) break;

    let title: string;
    if (typeof entry === "string") title = entry;
    else if (typeof entry === "object" && entry !== null && typeof (entry as { title?: unknown }).title === "string") {
      title = (entry as { title: string }).title;
    } else {
      continue;
    }

    title = title.trim();
    if (!title) continue;
    if (title.length > 160) title = title.slice(0, 157).trimEnd() + "…";

    const record = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const estimate =
      typeof record.estimateMinutes === "number" && Number.isFinite(record.estimateMinutes)
        ? Math.min(MAX_ESTIMATE_MINUTES, Math.max(MIN_ESTIMATE_MINUTES, Math.round(record.estimateMinutes)))
        : null;

    steps.push({ title, estimateMinutes: estimate, priority: asPriority(record.priority) });
  }

  return steps.length >= MIN_STEPS ? steps : null;
}

async function callModel(request: PlanRequest): Promise<PlannedStep[] | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;

  const apiUrl = Deno.env.get("AI_API_URL") ?? "https://api.openai.com/v1/chat/completions";
  const model = Deno.env.get("AI_MODEL") ?? "gpt-4o-mini";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            title: request.title,
            notes: request.notes,
            estimateMinutes: request.estimateMinutes,
            priority: request.priority,
            maxSteps: request.maxSteps,
          }),
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;

  return parseSteps(content, request.maxSteps);
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

  // --- layer 3: rate limit ----------------------------------------------------
  const { data: allowed, error: budgetError } = await admin.rpc("consume_ai_budget", {
    p_user_id: auth.user.id,
    p_limit: RATE_LIMIT_PER_MINUTE,
  });
  if (budgetError) return respond({ error: "rate_limiter_unavailable" }, 500);
  if (allowed !== true) return respond({ error: "rate_limited", retry_after: 60 }, 429);

  // --- body -------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({ error: "invalid_json" }, 400);
  }
  const plan = readPlanRequest(body);
  if (!plan) return respond({ error: "invalid_request" }, 400);

  // --- layer 4: the model -----------------------------------------------------
  const steps = await callModel(plan);
  // A missing/short plan is a non-2xx, so the app's on-device planner takes over
  // and the button still produces a plan.
  if (!steps) return respond({ error: "model_unavailable" }, 502);

  return respond({ steps }, 200);
});
