-- TaskFlow · Supabase / PostgreSQL schema
--
-- Mirrors the on-device SQLite schema column-for-column (snake_case), so the
-- sync engine can push and pull rows without a mapping layer. Deletions are
-- tombstones (`deleted_at`), and `updated_at` drives last-write-wins merges.
--
-- Apply with:  supabase db push   (or paste into the SQL editor)

create extension if not exists "uuid-ossp";

-- --------------------------------------------------------------------------
-- Identity
-- --------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text not null default 'You',
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', 'You'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------------
-- Content
-- --------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#0D9488',
  icon        text not null default 'folder',
  is_archived boolean not null default false,
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists public.tags (
  id         uuid primary key default uuid_generate_v4(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#0D9488',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.tasks (
  id                uuid primary key default uuid_generate_v4(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  project_id        uuid references public.projects(id) on delete set null,
  parent_id         uuid references public.tasks(id) on delete cascade,
  title             text not null,
  notes             text not null default '',
  status            text not null default 'todo'
                    check (status in ('todo', 'in_progress', 'done', 'archived')),
  priority          text not null default 'none'
                    check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  due_at            timestamptz,
  remind_at         timestamptz,
  recurrence        jsonb,
  location_reminder jsonb,
  estimate_minutes  integer,
  attachments       jsonb not null default '[]'::jsonb,
  position          double precision not null default 0,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists idx_tasks_owner_due  on public.tasks(owner_id, due_at);
create index if not exists idx_tasks_project    on public.tasks(project_id);
create index if not exists idx_tasks_parent     on public.tasks(parent_id);
create index if not exists idx_tasks_updated_at on public.tasks(updated_at);
create index if not exists idx_tasks_search     on public.tasks
  using gin (to_tsvector('english', title || ' ' || notes));

create table if not exists public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table if not exists public.habits (
  id                uuid primary key default uuid_generate_v4(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  color             text not null default '#10B981',
  icon              text not null default 'flame',
  target_per_period integer not null default 1,
  cadence           text not null default 'daily' check (cadence in ('daily', 'weekly')),
  by_weekday        jsonb not null default '[]'::jsonb,
  is_archived       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id         uuid primary key default uuid_generate_v4(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  date_key   date not null,
  count      integer not null default 1,
  created_at timestamptz not null default now(),
  unique (habit_id, date_key)
);

create table if not exists public.focus_sessions (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  task_id          uuid references public.tasks(id) on delete set null,
  project_id       uuid references public.projects(id) on delete set null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer not null default 0,
  kind             text not null default 'focus' check (kind in ('focus', 'break')),
  completed        boolean not null default false
);

create index if not exists idx_focus_owner_started on public.focus_sessions(owner_id, started_at);

-- --------------------------------------------------------------------------
-- Collaboration
-- --------------------------------------------------------------------------
create table if not exists public.list_members (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  role         text not null default 'viewer' check (role in ('owner', 'editor', 'viewer')),
  joined_at    timestamptz not null default now(),
  unique (project_id, user_id)
);

create table if not exists public.activity_logs (
  id          uuid primary key default uuid_generate_v4(),
  entity_kind text not null,
  entity_id   uuid not null,
  actor_id    uuid not null references auth.users(id) on delete cascade,
  action      text not null,
  summary     text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_entity on public.activity_logs(entity_kind, entity_id, created_at desc);

-- --------------------------------------------------------------------------
-- Helper: is the caller allowed to see this project?
-- --------------------------------------------------------------------------
create or replace function public.can_access_project(target uuid)
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
    where m.project_id = target and m.user_id = auth.uid()
  );
$$;

-- --------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------
alter table public.user_profiles   enable row level security;
alter table public.projects        enable row level security;
alter table public.tags            enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_tags       enable row level security;
alter table public.habits          enable row level security;
alter table public.habit_logs      enable row level security;
alter table public.focus_sessions  enable row level security;
alter table public.list_members    enable row level security;
alter table public.activity_logs   enable row level security;

-- Profiles: own row only.
create policy "profiles_select_own" on public.user_profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.user_profiles
  for update using (id = auth.uid());

-- Projects: owner or shared member.
create policy "projects_select" on public.projects
  for select using (owner_id = auth.uid() or public.can_access_project(id));
create policy "projects_insert" on public.projects
  for insert with check (owner_id = auth.uid());
create policy "projects_update" on public.projects
  for update using (owner_id = auth.uid());
create policy "projects_delete" on public.projects
  for delete using (owner_id = auth.uid());

-- Tasks: visible when owned, or when they live in a shared project.
create policy "tasks_select" on public.tasks
  for select using (
    owner_id = auth.uid()
    or (project_id is not null and public.can_access_project(project_id))
  );
create policy "tasks_insert" on public.tasks
  for insert with check (
    owner_id = auth.uid()
    and (project_id is null or public.can_access_project(project_id))
  );
create policy "tasks_update" on public.tasks
  for update using (
    owner_id = auth.uid()
    or (project_id is not null and public.can_access_project(project_id))
  );
create policy "tasks_delete" on public.tasks
  for delete using (owner_id = auth.uid());

-- Tags: private to their owner.
create policy "tags_all" on public.tags
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Task/tag links follow task visibility.
create policy "task_tags_select" on public.task_tags
  for select using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (t.owner_id = auth.uid()
             or (t.project_id is not null and public.can_access_project(t.project_id)))
    )
  );
create policy "task_tags_write" on public.task_tags
  for all using (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
  );

-- Personal productivity tables.
create policy "habits_all" on public.habits
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "habit_logs_all" on public.habit_logs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "focus_sessions_all" on public.focus_sessions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Sharing roster: visible to members, editable by the owner.
create policy "list_members_select" on public.list_members
  for select using (user_id = auth.uid() or public.can_access_project(project_id));
create policy "list_members_write" on public.list_members
  for all using (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

-- Activity: readable by anyone who can see the entity.
create policy "activity_select" on public.activity_logs
  for select using (actor_id = auth.uid());
create policy "activity_insert" on public.activity_logs
  for insert with check (actor_id = auth.uid());

-- --------------------------------------------------------------------------
-- updated_at maintenance
-- --------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['projects', 'tags', 'tasks', 'habits']
  loop
    execute format(
      'drop trigger if exists trg_touch_%1$s on public.%1$s;
       create trigger trg_touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at();',
      t
    );
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- Realtime: stream shared-list changes so collaborators see edits live.
-- --------------------------------------------------------------------------
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.activity_logs;
