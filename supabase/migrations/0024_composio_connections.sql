-- Migration 0024 — Composio : compte connecté + provider

alter table user_connections
  add column if not exists composio_account_id text,
  add column if not exists provider text not null default 'native'
    check (provider in ('native', 'composio'));

create index if not exists idx_user_connections_composio
  on user_connections(owner_id, connector_id)
  where provider = 'composio';

comment on column user_connections.composio_account_id is 'ID connected account Composio (ca_...)';
comment on column user_connections.provider is 'native = OAuth maison, composio = backend Composio';
