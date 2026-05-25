-- ============================================================
-- Migration 0009 — Clés API utilisateur & organisation
-- ============================================================

create table user_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'mistral', 'serper')),
  encrypted_key text not null,
  last4 text not null,
  is_valid boolean default true,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  unique (owner_id, provider)
);

create table org_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  provider text not null check (provider in ('openai', 'anthropic', 'google', 'mistral', 'serper')),
  encrypted_key text not null,
  last4 text not null,
  is_valid boolean default true,
  last_checked_at timestamptz,
  created_at timestamptz default now()
);

create table key_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  provider text not null,
  event_type text not null check (event_type in ('added', 'rotated', 'deleted', 'invalidated')),
  created_at timestamptz default now()
);

alter table user_api_keys enable row level security;
alter table key_events enable row level security;

create policy "Users read own keys metadata"
  on user_api_keys for select
  using (auth.uid() = owner_id);

create policy "Users insert own keys"
  on user_api_keys for insert
  with check (auth.uid() = owner_id);

create policy "Users update own keys"
  on user_api_keys for update
  using (auth.uid() = owner_id);

create policy "Users delete own keys"
  on user_api_keys for delete
  using (auth.uid() = owner_id);

create policy "Users read own key events"
  on key_events for select
  using (auth.uid() = owner_id);

create policy "Users insert own key events"
  on key_events for insert
  with check (auth.uid() = owner_id);

create index idx_user_api_keys_owner on user_api_keys(owner_id);
