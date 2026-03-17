-- Touhou-talk - Relationship / Memory persistence (Supabase)
-- =========================================================
-- Additive migration (safe to run multiple times).
-- Intended to be run in Supabase SQL Editor.
--
-- Goals:
-- - Persist per-user, per-character relationship state (trust/familiarity) across web/desktop.
-- - Persist per-user extracted "memory" profile (topics/emotions/recurring issues/traits).
-- - Keep forward-compatibility for future B expansion via `scope_key` (A uses "global").

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Relationship (extend existing table)
-- ---------------------------------------------------------

-- Existing: public.player_character_relations
-- NOTE: Today it is unique(user_id, character_id). We add scope_key now but keep A-mode by using "global".
-- When B-mode is enabled, plan a migration to unique(user_id, character_id, scope_key).

-- If the base table does not exist in your Supabase project yet, create it here (safe/no-op when already created).
create table if not exists public.player_character_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id text not null,

  affinity double precision not null default 0,
  trust double precision not null default 0,
  friendship double precision not null default 0,
  role text,

  last_updated timestamptz not null default now(),

  unique (user_id, character_id)
);

create index if not exists idx_player_character_relations_user
  on public.player_character_relations (user_id, last_updated desc);

-- RLS (align with existing "common_*" tables: users can only read/write their own rows).
alter table public.player_character_relations enable row level security;

drop policy if exists player_character_relations_select_own on public.player_character_relations;
create policy player_character_relations_select_own
  on public.player_character_relations for select
  using (auth.uid() = user_id);

drop policy if exists player_character_relations_insert_own on public.player_character_relations;
create policy player_character_relations_insert_own
  on public.player_character_relations for insert
  with check (auth.uid() = user_id);

drop policy if exists player_character_relations_update_own on public.player_character_relations;
create policy player_character_relations_update_own
  on public.player_character_relations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists player_character_relations_delete_own on public.player_character_relations;
create policy player_character_relations_delete_own
  on public.player_character_relations for delete
  using (auth.uid() = user_id);

alter table if exists public.player_character_relations
  add column if not exists scope_key text not null default 'global';

alter table if exists public.player_character_relations
  add column if not exists familiarity double precision not null default 0;

alter table if exists public.player_character_relations
  add column if not exists rev bigint not null default 0;

create index if not exists idx_player_character_relations_user_character_scope_updated
  on public.player_character_relations (user_id, character_id, scope_key, last_updated desc);

-- ---------------------------------------------------------
-- Memory profile (new table)
-- ---------------------------------------------------------

create table if not exists public.touhou_user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scope_key text not null default 'global',

  topics text[] not null default '{}',
  emotions text[] not null default '{}',
  recurring_issues text[] not null default '{}',
  traits text[] not null default '{}',

  rev bigint not null default 0,
  updated_at timestamptz not null default now(),

  unique (user_id, scope_key)
);

create index if not exists idx_touhou_user_memory_user_scope_updated
  on public.touhou_user_memory (user_id, scope_key, updated_at desc);

alter table public.touhou_user_memory enable row level security;

drop policy if exists touhou_user_memory_select_own on public.touhou_user_memory;
create policy touhou_user_memory_select_own
  on public.touhou_user_memory for select
  using (auth.uid() = user_id);

drop policy if exists touhou_user_memory_insert_own on public.touhou_user_memory;
create policy touhou_user_memory_insert_own
  on public.touhou_user_memory for insert
  with check (auth.uid() = user_id);

drop policy if exists touhou_user_memory_update_own on public.touhou_user_memory;
create policy touhou_user_memory_update_own
  on public.touhou_user_memory for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists touhou_user_memory_delete_own on public.touhou_user_memory;
create policy touhou_user_memory_delete_own
  on public.touhou_user_memory for delete
  using (auth.uid() = user_id);
