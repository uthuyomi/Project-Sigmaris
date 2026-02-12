-- Phase04: External I/O audit log (replay-friendly)
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.common_io_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id text,
  trace_id text,

  -- e.g. "web_search" | "web_fetch" | "github_repo_search" | "github_code_search" | "upload" | "parse"
  event_type text not null,
  cache_key text,

  ok boolean not null default true,
  error text,

  request jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  source_urls jsonb not null default '[]'::jsonb,
  content_sha256 text,
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_common_io_events_user_created
  on public.common_io_events (user_id, created_at desc);

create index if not exists idx_common_io_events_user_session_created
  on public.common_io_events (user_id, session_id, created_at desc);

create index if not exists idx_common_io_events_cache
  on public.common_io_events (user_id, event_type, cache_key, created_at desc);

alter table public.common_io_events enable row level security;

drop policy if exists common_io_events_select_own on public.common_io_events;
create policy common_io_events_select_own
  on public.common_io_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists common_io_events_insert_own on public.common_io_events;
create policy common_io_events_insert_own
  on public.common_io_events for insert
  to authenticated
  with check (user_id = auth.uid());

