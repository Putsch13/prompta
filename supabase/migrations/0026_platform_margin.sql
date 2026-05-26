-- SCALE-5 — Suivi marge plateforme + coupe-circuit mode crédits

create table if not exists platform_run_economics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  run_id uuid,
  run_type text not null check (run_type in ('prompt', 'agent')),
  actual_cost_cents numeric not null,
  billed_cents int not null,
  margin_cents int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_run_economics_day
  on platform_run_economics(created_at desc);

create table if not exists platform_credit_guard (
  id int primary key default 1 check (id = 1),
  is_paused boolean not null default false,
  daily_cost_cents numeric not null default 0,
  daily_margin_cents numeric not null default 0,
  guard_day date not null default current_date,
  updated_at timestamptz not null default now()
);

insert into platform_credit_guard (id) values (1) on conflict (id) do nothing;

alter table listing_agent_runs
  add column if not exists used_credits boolean not null default false,
  add column if not exists credit_hold_estimate_cents numeric;

alter table platform_run_economics enable row level security;

drop policy if exists "Admins read platform economics" on platform_run_economics;
create policy "Admins read platform economics"
  on platform_run_economics for select
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

comment on table platform_run_economics is 'Coût réel vs facturé par run crédits (suivi marge)';
comment on table platform_credit_guard is 'Coupe-circuit journalier mode crédits plateforme';
