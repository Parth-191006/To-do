-- TaskFlow · Supabase 0006 — list invites
--
-- 0004 deliberately left self-joining a list unbuilt: "an invite has to be
-- checked against a token, so that policy arrives with the invite flow rather
-- than as an 'anyone who guesses a project id may add themselves' hole." This
-- migration is that flow.
--
-- The design keeps the token as the only secret and moves every privilege
-- escalation into two SECURITY DEFINER functions, so there is no policy a
-- malicious client can satisfy by guessing:
--
--   create_list_invite(project, email?)  — editor/owner only; mints a random
--                                          48-hex-char token server-side.
--   accept_list_invite(token)            — validates expiry, single use and
--                                          (when set) the invited email, then
--                                          inserts the caller into
--                                          list_members. Idempotent for the
--                                          person who already accepted, so a
--                                          magic-link redirect that races a
--                                          re-open cannot turn a success into
--                                          an error.
--
-- Clients can only SELECT and DELETE invites for lists they may edit (to see
-- and revoke what they sent). Nobody can INSERT or UPDATE directly — minting
-- and consuming both go through the functions.
--
-- Apply with:  supabase db push   (or paste into the SQL editor)

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- The invite rows
-- --------------------------------------------------------------------------
create table if not exists public.list_invites (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  -- 24 random bytes, hex-encoded: unguessable, safe to embed in a link that
  -- travels through email and the OS share sheet.
  token       text not null unique,
  -- Optional binding: when set, only this email address may accept.
  email       text,
  role        text not null default 'editor' check (role in ('editor', 'viewer')),
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_list_invites_project on public.list_invites(project_id);

alter table public.list_invites enable row level security;

-- Owner/editors see (and may revoke) the invites they could have sent.
-- There is intentionally no INSERT policy: minting happens in the function
-- below, which mints a server-generated token instead of trusting a client
-- value.
create policy "list_invites_select" on public.list_invites
  for select using (public.can_edit_project(project_id));

create policy "list_invites_delete" on public.list_invites
  for delete using (public.can_edit_project(project_id));

-- --------------------------------------------------------------------------
-- Mint an invite. Caller must be able to edit the list.
-- --------------------------------------------------------------------------
create or replace function public.create_list_invite(
  p_project_id uuid,
  p_email text default null
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not public.can_edit_project(p_project_id) then
    raise exception 'only a list editor may create invites' using errcode = '42501';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.list_invites (project_id, token, email, created_by)
  values (
    p_project_id,
    v_token,
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    auth.uid()
  );

  return v_token;
end;
$$;

-- --------------------------------------------------------------------------
-- Consume an invite. Token validity is checked here, not by a policy, so a
-- leaked anon key still cannot add itself to a list without a real token.
-- --------------------------------------------------------------------------
create or replace function public.accept_list_invite(p_token text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_invite public.list_invites%rowtype;
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into v_invite from public.list_invites where token = p_token;
  if not found then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  -- Idempotent for the acceptor: a re-opened link (or a redirect racing the
  -- first accept) returns the same project instead of erroring.
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by = v_uid then
      return v_invite.project_id;
    end if;
    raise exception 'invite already used' using errcode = '42501';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'invite expired' using errcode = 'P0002';
  end if;

  if v_invite.email is not null then
    select lower(coalesce(email, '')) into v_email
    from public.user_profiles where id = v_uid;
    if v_invite.email <> coalesce(v_email, '') then
      raise exception 'this invite was sent to a different email address' using errcode = '42501';
    end if;
  end if;

  insert into public.list_members (project_id, user_id, display_name, role)
  values (
    v_invite.project_id,
    v_uid,
    split_part(coalesce(v_email, 'You'), '@', 1),
    v_invite.role
  )
  on conflict (project_id, user_id) do nothing;

  update public.list_invites
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invite.id;

  return v_invite.project_id;
end;
$$;

-- The functions are the only join path; lock down direct execution surface.
revoke execute on function public.create_list_invite(uuid, text) from public, anon;
revoke execute on function public.accept_list_invite(text) from public, anon;
grant execute on function public.create_list_invite(uuid, text) to authenticated;
grant execute on function public.accept_list_invite(text) to authenticated;

comment on function public.accept_list_invite(text) is
  'Consumes a single-use invite token and returns the project id. Validates expiry, reuse and email binding; the acceptor is idempotent for the same user.';
