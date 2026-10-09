-- TaskFlow · Supabase 0005 — per-feature API budgets
--
-- 0003 introduced `consume_ai_budget(user, limit)` for the breakdown proxy. The
-- transcription proxy needs the same gate with its *own* quota: audio uploads
-- are billed per minute by every provider, so one shared counter would let a
-- burst of voice notes starve task breakdowns (and the reverse).
--
-- Same fixed one-minute window as 0003, now keyed by (user, bucket):
--
--     consume_api_budget(user_id, 'ai-breakdown' | 'transcribe', limit)
--
-- `consume_ai_budget` keeps its exact 0003 signature and delegates to the bucket
-- form, so an already-deployed ai-breakdown function keeps working without a
-- redeploy. Execution stays revoked from anon/authenticated (only the edge
-- functions, acting with the service role, may call either one) — otherwise any
-- signed-in user could pass somebody else's id and burn their quota.
--
-- Apply with:  supabase db push   (or paste into the SQL editor)
-- Safe to run more than once.

create table if not exists public.api_usage (
  user_id      uuid not null references auth.users(id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (user_id, bucket)
);

revoke all on public.api_usage from public, anon, authenticated;

create or replace function public.consume_api_budget(
  p_user_id uuid,
  p_bucket  text,
  p_limit   integer default 20
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  window_end timestamptz := date_trunc('minute', now());
  used       integer;
begin
  if p_user_id is null
     or p_bucket is null
     or length(p_bucket) = 0
     or p_limit is null
     or p_limit < 1 then
    return false;
  end if;

  insert into public.api_usage as u (user_id, bucket, window_start, hits)
  values (p_user_id, p_bucket, window_end, 1)
  on conflict (user_id, bucket) do update
    set window_start = case
                         when u.window_start < excluded.window_start then excluded.window_start
                         else u.window_start
                       end,
        hits         = case
                         when u.window_start < excluded.window_start then 1
                         else u.hits + 1
                       end
  returning u.hits into used;

  -- Opportunistic cleanup, roughly one request in twenty: a bucket nobody has
  -- touched for an hour is not worth keeping.
  if random() < 0.05 then
    delete from public.api_usage where window_start < now() - interval '1 hour';
  end if;

  return used <= p_limit;
end;
$$;

revoke execute on function public.consume_api_budget(uuid, text, integer) from public, anon, authenticated;
grant  execute on function public.consume_api_budget(uuid, text, integer) to service_role;

comment on function public.consume_api_budget(uuid, text, integer) is
  'Fixed one-minute per-user, per-feature quota for the edge-function proxies. Service role only.';

-- The 0003 entry point, now a thin wrapper. Same signature, same grants.
create or replace function public.consume_ai_budget(p_user_id uuid, p_limit integer default 20)
returns boolean
language sql
security definer set search_path = public
as $$
  select public.consume_api_budget(p_user_id, 'ai-breakdown', p_limit);
$$;

revoke execute on function public.consume_ai_budget(uuid, integer) from public, anon, authenticated;
grant  execute on function public.consume_ai_budget(uuid, integer) to service_role;

comment on function public.consume_ai_budget(uuid, integer) is
  'Back-compatible wrapper over consume_api_budget with the ai-breakdown bucket. Service role only.';

-- `ai_usage` (0003) is superseded by `api_usage`. It is left in place rather
-- than dropped in the same release that stops writing to it: an unused table
-- costs nothing, and a drop cannot be undone if the proxy has to be rolled back.
