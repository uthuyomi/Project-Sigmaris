-- Sigmaris OS (frontend) minimal schema
-- This is intentionally small: login is handled by Supabase Auth.
-- These tables support chat history in the Next.js app server routes.

create table if not exists public.messages (
  id bigserial primary key,
  user_id uuid not null,
  session_id text not null,
  session_title text null,
  role text not null check (role in ('user','ai')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_user_session_idx
  on public.messages (user_id, session_id, created_at);

-- Optional (account page may query this; safe to keep even if unused)
create table if not exists public.reflections (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  reflection text null,
  reflection_text text null,
  created_at timestamptz not null default now()
);

create index if not exists reflections_user_created_idx
  on public.reflections (user_id, created_at desc);

-- Optional debug logs (used by some legacy code paths)
create table if not exists public.debug_logs (
  id bigserial primary key,
  phase text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists debug_logs_created_idx
  on public.debug_logs (created_at desc);

-- ============================================================
-- Sigmaris Persona OS state snapshots (for dashboards)
-- - /api/aei が /persona/chat の meta を受け取り、必要な数値を抽出して保存する
-- - グラフ/状態ページで「今どういう状態か」を即表示できるようにする
-- ============================================================
create table if not exists public.sigmaris_state_snapshots (
  id bigserial primary key,
  user_id uuid not null,
  session_id text null,
  trace_id text null,

  global_state text null,
  overload_score double precision null,
  reflective_score double precision null,
  memory_pointer_count integer null,

  safety_flag text null,
  safety_risk_score double precision null,

  value_state jsonb null,
  trait_state jsonb null,

  meta jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists sigmaris_state_snapshots_user_created_idx
  on public.sigmaris_state_snapshots (user_id, created_at desc);
