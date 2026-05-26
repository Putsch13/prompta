-- Migration 0022 — Connexions OAuth utilisateur (connecteurs exécutables)

create table if not exists user_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  connector_id text not null,
  access_token_enc text,
  refresh_token_enc text,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'expired')),
  scopes text[] default '{}',
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (owner_id, connector_id)
);

alter table user_connections enable row level security;

create policy "Users read own connections"
  on user_connections for select using (auth.uid() = owner_id);

create policy "Users delete own connections"
  on user_connections for delete using (auth.uid() = owner_id);

create index idx_user_connections_owner on user_connections(owner_id);

comment on table user_connections is 'Tokens OAuth chiffrés par utilisateur et connecteur';
