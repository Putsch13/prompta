-- 0038 — Identité compte connecteur (email, workspace, scopes vérifiés)

alter table user_connections
  add column if not exists account_email text,
  add column if not exists account_name text,
  add column if not exists workspace_name text,
  add column if not exists last_checked_at timestamptz;

comment on column user_connections.account_email is 'Email du compte OAuth utilisé (ex: Gmail)';
comment on column user_connections.account_name is 'Nom affiché du compte connecté';
comment on column user_connections.workspace_name is 'Workspace / team (Slack, Notion, etc.)';
comment on column user_connections.last_checked_at is 'Dernière vérification de santé du connecteur';
