-- Migration 0023 — Grand livre crédits (hold / régularisation)

alter table credit_transactions
  drop constraint if exists credit_transactions_kind_check;

alter table credit_transactions
  add constraint credit_transactions_kind_check
  check (kind in ('purchase', 'run_debit', 'refund', 'bonus', 'hold', 'hold_release'));

alter table user_credits
  add column if not exists held_cents int not null default 0 check (held_cents >= 0);

comment on column user_credits.held_cents is 'Crédits bloqués en pré-autorisation avant run';

create index if not exists idx_credit_tx_run on credit_transactions(run_id) where run_id is not null;
