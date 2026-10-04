-- TaskFlow · Supabase 0002 — per-field sync stamps
--
-- The client no longer merges shared-list edits with whole-row last-write-wins.
-- Each task row carries a small JSON map of `field -> ISO-8601 stamp` recording
-- when *that column* was last written, so two people editing different fields of
-- the same task both keep their change.
--
-- `field_meta` is part of the row the client pushes and pulls verbatim (the sync
-- engine selects `*`), so there is no mapping layer to maintain. A row without
-- the column round-trips fine — the client treats a missing map as "no stamps" —
-- but until this migration is applied, stamps never survive a push, and every
-- pull degrades to last-write-wins for that device.
--
-- Apply with:  supabase db push   (or paste into the SQL editor)
--
-- Safe to run more than once.

alter table public.tasks
  add column if not exists field_meta jsonb not null default '{}'::jsonb;

comment on column public.tasks.field_meta is
  'Per-field write stamps: {"title": "2026-10-04T11:03:22.104Z", ...}. Merged per field by the client; see src/services/sync/merge.ts.';

-- The pull is `updated_at > last_pulled_at`, already indexed by idx_tasks_updated_at.
