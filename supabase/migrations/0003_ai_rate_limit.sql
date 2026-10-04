-- TaskFlow · Supabase 0003 — AI proxy rate limit
--
-- The AI key lives in an edge function (supabase/functions/ai-breakdown), which
-- makes that function the only thing standing between a leaked endpoint URL and
-- somebody else's model bill. Per-minute, per-user quotas are enforced in
-- Postgres rather than in the function so the counter survives a cold start and
-- can be read from a dashboard.
--
-- A fixed one-minute window (truncated to the minute) rather than a sliding
-- window: one row per user, one upsert per request, nothing to clean up mid-
-- request. Stale rows are dropped opportunistically.
--
-- Execution is revoked from anon/authenticated: the only caller is the edge
-- function acting with the service role. Without that, any signed-in user could
-- pass *another* user's id and burn their quota.
--
-- Apply with:  supabase db push   (or paste into the SQL editor)
--
-- Safe to run more than once.

create table if not exists public.ai_usage (
  user_id      uuid primary key,
  window_start timestamptz not null,
  hits         integer not null default 0
);

revoke all on public.ai_usage from public, anon, authenticated;

create or replace function public.consume_ai_budget(p_user_id uuid, p_limit integer default 20)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  window_end timestamptz := date_trunc('minute', now());
  used       integer;
begin
  if p_user_id is null or p_limit is null or p_limit < 1 then
    return false;
  end if;

  insert into public.ai_usage as u (user_id, window_start, hits)
  values (p_user_id, window_end, 1)
  on conflict (user_id) do update
    set window_start = case
                         when u.window_start < excluded.window_start then excluded.window_start
                         else u.window_start
                       end,
        hits         = case
                         when u.window_start < excluded.window_start then 1
                         else u.hits + 1
                       end
  returning u.hits into used;

  -- Opportunistic cleanup of windows nobody has touched in an hour. Runs on
  -- roughly one request in twenty, so it never sits on the hot path.
  if random() < 0.05 then
    delete from public.ai_usage where window_start < now() - interval '1 hour';
  end if;

  return used <= p_limit;
end;
$$;

revoke execute on function public.consume_ai_budget(uuid, integer) from public, anon, authenticated;
grant  execute on function public.consume_ai_budget(uuid, integer) to service_role;

comment on function public.consume_ai_budget(uuid, integer) is
  'Fixed one-minute per-user quota for the AI breakdown proxy. Service role only.';
