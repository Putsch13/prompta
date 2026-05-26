-- 0027 — Fix FK credit_transactions : support polymorphe prompt + agent runs
-- Le champ run_id pointait vers runs(id) uniquement, ce qui fait planter les
-- agents marketplace dont l'ID vient de listing_agent_runs.

-- 1. Ajout colonnes polymorphes
alter table credit_transactions
  add column if not exists run_type text
    check (run_type in ('prompt', 'agent', 'admin_agent', 'manual')),
  add column if not exists prompt_run_id uuid references runs(id) on delete set null,
  add column if not exists agent_run_id uuid references listing_agent_runs(id) on delete set null;

-- 2. Migrer les données existantes (run_id → prompt_run_id si run existe)
update credit_transactions
  set prompt_run_id = run_id, run_type = 'prompt'
  where run_id is not null
    and prompt_run_id is null
    and exists (select 1 from runs where runs.id = credit_transactions.run_id);

-- 3. Drop la FK problématique sur run_id (garder la colonne pour compat)
alter table credit_transactions
  drop constraint if exists credit_transactions_run_id_fkey;

-- 4. Index
create index if not exists idx_credit_tx_prompt_run on credit_transactions(prompt_run_id)
  where prompt_run_id is not null;
create index if not exists idx_credit_tx_agent_run on credit_transactions(agent_run_id)
  where agent_run_id is not null;

-- 5. RPC atomique hold
create or replace function hold_credits_for_run(
  p_user_id uuid,
  p_amount_cents int,
  p_run_id uuid,
  p_run_type text
) returns boolean
language plpgsql
as $$
declare
  v_balance int;
  v_held int;
  v_available int;
begin
  select balance_cents, held_cents
    into v_balance, v_held
    from user_credits
    where user_id = p_user_id
    for update;

  if not found then
    return false;
  end if;

  v_available := v_balance - v_held;
  if v_available < p_amount_cents then
    return false;
  end if;

  update user_credits
    set held_cents = v_held + p_amount_cents,
        updated_at = now()
    where user_id = p_user_id;

  insert into credit_transactions (user_id, amount_cents, kind, description, run_type, agent_run_id, prompt_run_id)
    values (
      p_user_id,
      -p_amount_cents,
      'hold',
      'Pré-autorisation run',
      p_run_type,
      case when p_run_type = 'agent' then p_run_id else null end,
      case when p_run_type = 'prompt' then p_run_id else null end
    );

  return true;
end;
$$;

-- 6. RPC atomique settle
create or replace function settle_credits_for_run(
  p_user_id uuid,
  p_actual_cents int,
  p_held_cents int,
  p_run_id uuid,
  p_run_type text
) returns void
language plpgsql
as $$
declare
  v_balance int;
  v_held int;
  v_new_held int;
  v_new_balance int;
  v_agent_run uuid;
  v_prompt_run uuid;
begin
  select balance_cents, held_cents
    into v_balance, v_held
    from user_credits
    where user_id = p_user_id
    for update;

  v_new_held := greatest(0, v_held - p_held_cents);
  v_new_balance := greatest(0, v_balance - p_actual_cents);

  update user_credits
    set balance_cents = v_new_balance,
        held_cents = v_new_held,
        updated_at = now()
    where user_id = p_user_id;

  v_agent_run := case when p_run_type = 'agent' then p_run_id else null end;
  v_prompt_run := case when p_run_type = 'prompt' then p_run_id else null end;

  if p_held_cents > p_actual_cents then
    insert into credit_transactions (user_id, amount_cents, kind, description, run_type, agent_run_id, prompt_run_id)
      values (p_user_id, p_held_cents - p_actual_cents, 'hold_release', 'Libération partielle', p_run_type, v_agent_run, v_prompt_run);
  end if;

  insert into credit_transactions (user_id, amount_cents, kind, description, run_type, agent_run_id, prompt_run_id)
    values (p_user_id, -p_actual_cents, 'run_debit', 'Exécution (coût réel)', p_run_type, v_agent_run, v_prompt_run);
end;
$$;

-- 7. RPC atomique release hold
create or replace function release_credit_hold(
  p_user_id uuid,
  p_held_cents int,
  p_run_id uuid,
  p_run_type text
) returns void
language plpgsql
as $$
declare
  v_held int;
begin
  select held_cents
    into v_held
    from user_credits
    where user_id = p_user_id
    for update;

  update user_credits
    set held_cents = greatest(0, v_held - p_held_cents),
        updated_at = now()
    where user_id = p_user_id;

  if p_held_cents > 0 then
    insert into credit_transactions (user_id, amount_cents, kind, description, run_type, agent_run_id, prompt_run_id)
      values (
        p_user_id,
        p_held_cents,
        'hold_release',
        'Annulation pré-autorisation',
        p_run_type,
        case when p_run_type = 'agent' then p_run_id else null end,
        case when p_run_type = 'prompt' then p_run_id else null end
      );
  end if;
end;
$$;

comment on function hold_credits_for_run is 'Atomique : bloque des crédits avant un run (FOR UPDATE)';
comment on function settle_credits_for_run is 'Atomique : débite le coût réel et libère le surplus (FOR UPDATE)';
comment on function release_credit_hold is 'Atomique : libère un hold sans débit (run failed)';
