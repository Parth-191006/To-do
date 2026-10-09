-- TaskFlow · Supabase 0004 — RLS hardening
--
-- The audit of 0001 found four holes worth closing. 0001 is left untouched
-- (deployed databases already have it applied), and everything below is
-- additive so it is safe to run more than once.
--
--  1. `owner_id` was movable. RLS decides which *rows* may be written, not
--     which columns, and an UPDATE policy with no WITH CHECK reuses its USING
--     expression — so a member of a shared list could have set `owner_id` to
--     themselves and pulled the row out of the original owner's reach. A
--     trigger now makes `owner_id` immutable on every owner-scoped table.
--  2. The `viewer` role was decorative: `tasks_update` accepted *any* member of
--     a shared project. Writing a task now needs the owner or an `editor`.
--  3. `activity_logs` documented "readable by anyone who can see the entity"
--     but only allowed the actor's own rows, so a collaboration feed showed one
--     person's history. Reads and writes go through `can_access_entity`.
--  4. A member could not leave a list. The roster was owner-write-only, so a
--     member could join (through the owner) and never exit.
--
-- Deliberately not here: self-joining a list. An invite has to be checked
-- against a token, so that policy arrives with the invite flow rather than as
-- an "anyone who guesses a project id may add themselves" hole.
--
-- Applying this changes what collaborators can do, so re-run it after any
-- manual edit of the policies in the dashboard.
--
-- Apply with:  supabase db push   (or paste into the SQL editor)

-- --------------------------------------------------------------------------
-- 1. owner_id is immutable
-- --------------------------------------------------------------------------
create or replace function public.enforce_owner_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id is immutable (attempted % -> %)', old.owner_id, new.owner_id
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['projects', 'tasks', 'tags', 'habits', 'habit_logs', 'focus_sessions']
  loop
    execute format(
      'drop trigger if exists trg_owner_immutable on public.%1$s;
       create trigger trg_owner_immutable before update on public.%1$s
       for each row execute function public.enforce_owner_immutable();',
      t
    );
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- 2. Write access: owner, or an editor of the shared list
-- --------------------------------------------------------------------------
create or replace function public.can_edit_project(target uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target and p.owner_id = auth.uid()
  ) or exists (
    select 1 from public.list_members m
    where m.project_id = target
      and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

comment on function public.can_edit_project(uuid) is
  'True when the caller owns the project or is an owner/editor member of it. Viewers are read-only.';

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    owner_id = auth.uid()
    and (project_id is null or public.can_edit_project(project_id))
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update using (
    owner_id = auth.uid()
    or (project_id is not null and public.can_edit_project(project_id))
  )
  with check (
    owner_id = auth.uid()
    or (project_id is not null and public.can_edit_project(project_id))
  );

-- Tag assignment follows the task: its owner, or an editor of its list.
drop policy if exists "task_tags_write" on public.task_tags;
create policy "task_tags_write" on public.task_tags
  for all using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (
          t.owner_id = auth.uid()
          or (t.project_id is not null and public.can_edit_project(t.project_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (
          t.owner_id = auth.uid()
          or (t.project_id is not null and public.can_edit_project(t.project_id))
        )
    )
  );

-- --------------------------------------------------------------------------
-- 3. Activity: visible and attributable to the entity's audience
-- --------------------------------------------------------------------------
create or replace function public.can_access_entity(p_kind text, p_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select case p_kind
    when 'project' then public.can_access_project(p_id)
    when 'task' then exists (
      select 1 from public.tasks t
      where t.id = p_id
        and (
          t.owner_id = auth.uid()
          or (t.project_id is not null and public.can_access_project(t.project_id))
        )
    )
    when 'tag' then exists (
      select 1 from public.tags tg where tg.id = p_id and tg.owner_id = auth.uid()
    )
    when 'habit' then exists (
      select 1 from public.habits h where h.id = p_id and h.owner_id = auth.uid()
    )
    when 'habit_log' then exists (
      select 1 from public.habit_logs x where x.id = p_id and x.owner_id = auth.uid()
    )
    when 'focus_session' then exists (
      select 1 from public.focus_sessions f where f.id = p_id and f.owner_id = auth.uid()
    )
    else false
  end;
$$;

comment on function public.can_access_entity(text, uuid) is
  'One predicate for "may the caller see this entity" across every entity_kind the clients log against.';

drop policy if exists "activity_select" on public.activity_logs;
create policy "activity_select" on public.activity_logs
  for select using (
    actor_id = auth.uid() or public.can_access_entity(entity_kind, entity_id)
  );

drop policy if exists "activity_insert" on public.activity_logs;
create policy "activity_insert" on public.activity_logs
  for insert with check (
    actor_id = auth.uid() and public.can_access_entity(entity_kind, entity_id)
  );

-- --------------------------------------------------------------------------
-- 4. A member may leave a list
-- --------------------------------------------------------------------------
drop policy if exists "list_members_leave" on public.list_members;
create policy "list_members_leave" on public.list_members
  for delete using (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- Notes for the reader
-- --------------------------------------------------------------------------
-- * `tags` stay private to their owner even inside a shared list: the client
--   syncs tags per account, and a collaborator's tag names are theirs. Nothing
--   in the app expects to read someone else's tags.
-- * `tasks_delete` (hard delete) stays owner-only. Deletions the app performs
--   are tombstones — an UPDATE of `deleted_at` — which editors can do.
-- * `ai_usage` / `api_usage` are not RLS-protected on purpose. They hold no
--   privileges for anon/authenticated at all, and enabling RLS with no policies
--   would also block the SECURITY DEFINER function that owns the counter if its
--   owner ever lost BYPASSRLS — a rate limiter that fails closed is worse here
--   than one that fails quiet.
