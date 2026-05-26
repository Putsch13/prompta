-- Migration 0023 — Grand livre crédits (hold / régularisation)
-- Idempotent : crée les tables si la migration 0017 n'a pas encore été appliquée.

create table if not exists user_credits (
  user_id uuid primary key references profiles(id) on delete cascade,
  balance_cents int not null default 0 check (balance_cents >= 0),
  updated_at timestamptz default now()
);

create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount_cents int not null,
  kind text not null,
  description text,
  run_id uuid references runs(id) on delete set null,
  stripe_session_id text,
  created_at timestamptz default now()
);

alter table user_credits enable row level security;
alter table credit_transactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_credits'
      and policyname = 'Users read own credits'
  ) then
    create policy "Users read own credits"
      on user_credits for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_transactions'
      and policyname = 'Users read own credit transactions'
  ) then
    create policy "Users read own credit transactions"
      on credit_transactions for select using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_credit_tx_user on credit_transactions(user_id, created_at desc);

alter table user_credits
  add column if not exists held_cents int not null default 0 check (held_cents >= 0);

comment on column user_credits.held_cents is 'Crédits bloqués en pré-autorisation avant run';

alter table credit_transactions
  drop constraint if exists credit_transactions_kind_check;

alter table credit_transactions
  add constraint credit_transactions_kind_check
  check (kind in ('purchase', 'run_debit', 'refund', 'bonus', 'hold', 'hold_release'));

create index if not exists idx_credit_tx_run on credit_transactions(run_id) where run_id is not null;
