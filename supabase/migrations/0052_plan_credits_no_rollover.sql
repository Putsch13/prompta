-- ===========================================================
-- 0052 — Crédits de plan NON REPORTABLES (use-it-or-lose-it)
--
-- Décision produit 2026-07-24 : les crédits inclus dans un abonnement ne se
-- cumulent PLUS d'un mois sur l'autre. Un wallet unique rendait le report
-- inévitable par construction ; on sépare donc DEUX compartiments :
--
--   • plan_credits_cents  = allocation mensuelle de l'abonnement. REMPLACÉE
--     (jamais additionnée) à chaque facture, expire avec le cycle.
--   • balance_cents       = crédits ACHETÉS (packs) + bienvenue + remboursements.
--     Payés à l'unité par l'utilisateur : ils n'expirent JAMAIS.
--
-- Ordre de consommation : le compartiment de plan D'ABORD (c'est lui qui
-- périme), les crédits achetés ensuite. Un abonné ne perd donc jamais un
-- crédit qu'il a payé à l'unité parce que son mois s'est écoulé.
--
-- Idempotente — à exécuter dans Supabase → SQL Editor.
-- ===========================================================

alter table user_credits
  add column if not exists plan_credits_cents int not null default 0
    check (plan_credits_cents >= 0);

alter table user_credits
  add column if not exists plan_credits_expire_at timestamptz;

-- ── Allocation de plan encore valide (0 si le cycle est passé) ──────────────
create or replace function effective_plan_credits(
  p_amount int,
  p_expire_at timestamptz
) returns int
language sql
immutable
as $$
  select case
    when p_amount is null then 0
    when p_expire_at is not null and p_expire_at <= now() then 0
    else greatest(0, p_amount)
  end;
$$;

-- ── Octroi mensuel : REMPLACE l'allocation, ne l'additionne pas ─────────────
-- Renvoie le reliquat périmé (cents) pour que l'appelant puisse le tracer au
-- ledger. Les crédits achetés (balance_cents) ne sont jamais touchés.
create or replace function grant_plan_credits(
  p_user_id uuid,
  p_amount_cents int,
  p_expire_at timestamptz
) returns int
language plpgsql
as $$
declare
  v_previous int;
begin
  insert into user_credits (user_id, balance_cents, plan_credits_cents, plan_credits_expire_at, updated_at)
    values (p_user_id, 0, greatest(0, p_amount_cents), p_expire_at, now())
    on conflict (user_id) do nothing;

  select effective_plan_credits(plan_credits_cents, plan_credits_expire_at)
    into v_previous
    from user_credits
    where user_id = p_user_id
    for update;

  update user_credits
    set plan_credits_cents = greatest(0, p_amount_cents),
        plan_credits_expire_at = p_expire_at,
        updated_at = now()
    where user_id = p_user_id;

  return coalesce(v_previous, 0);
end;
$$;

-- ── Dépense atomique : plan d'abord, achetés ensuite ────────────────────────
-- Renvoie le montant RÉELLEMENT débité (peut être < p_amount si le solde est
-- insuffisant — le ledger doit refléter le débité, pas le demandé).
create or replace function spend_credits(
  p_user_id uuid,
  p_amount_cents int
) returns int
language plpgsql
as $$
declare
  v_plan int;
  v_balance int;
  v_from_plan int;
  v_from_balance int;
begin
  if p_amount_cents <= 0 then
    return 0;
  end if;

  select effective_plan_credits(plan_credits_cents, plan_credits_expire_at), balance_cents
    into v_plan, v_balance
    from user_credits
    where user_id = p_user_id
    for update;

  if not found then
    return 0;
  end if;

  v_from_plan := least(v_plan, p_amount_cents);
  v_from_balance := least(greatest(0, v_balance), p_amount_cents - v_from_plan);

  update user_credits
    set plan_credits_cents = v_plan - v_from_plan,
        balance_cents = greatest(0, v_balance) - v_from_balance,
        updated_at = now()
    where user_id = p_user_id;

  return v_from_plan + v_from_balance;
end;
$$;

-- ── Hold : la disponibilité inclut l'allocation de plan encore valide ───────
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
  v_plan int;
  v_available int;
begin
  select balance_cents, held_cents,
         effective_plan_credits(plan_credits_cents, plan_credits_expire_at)
    into v_balance, v_held, v_plan
    from user_credits
    where user_id = p_user_id
    for update;

  if not found then
    return false;
  end if;

  v_available := v_balance + v_plan - v_held;
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

-- ── Settle : débite via spend_credits (plan d'abord) ────────────────────────
-- Le ledger enregistre le montant RÉELLEMENT débité (l'ancienne version
-- écrivait le montant demandé même quand le solde le plafonnait à 0, ce qui
-- faisait diverger ledger et solde et gonflait le cumul mensuel).
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
  v_held int;
  v_debited int;
  v_agent_run uuid;
  v_prompt_run uuid;
begin
  v_debited := spend_credits(p_user_id, p_actual_cents);

  select held_cents into v_held
    from user_credits
    where user_id = p_user_id
    for update;

  update user_credits
    set held_cents = greatest(0, coalesce(v_held, 0) - p_held_cents),
        updated_at = now()
    where user_id = p_user_id;

  v_agent_run := case when p_run_type = 'agent' then p_run_id else null end;
  v_prompt_run := case when p_run_type = 'prompt' then p_run_id else null end;

  if p_held_cents > p_actual_cents then
    insert into credit_transactions (user_id, amount_cents, kind, description, run_type, agent_run_id, prompt_run_id)
      values (p_user_id, p_held_cents - p_actual_cents, 'hold_release', 'Libération partielle', p_run_type, v_agent_run, v_prompt_run);
  end if;

  if v_debited > 0 then
    insert into credit_transactions (user_id, amount_cents, kind, description, run_type, agent_run_id, prompt_run_id)
      values (p_user_id, -v_debited, 'run_debit', 'Exécution (coût réel)', p_run_type, v_agent_run, v_prompt_run);
  end if;
end;
$$;

comment on function grant_plan_credits is 'Remplace l''allocation mensuelle du plan (non reportable) ; renvoie le reliquat périmé';
comment on function spend_credits is 'Débite les crédits : allocation de plan d''abord (périssable), crédits achetés ensuite';
comment on function effective_plan_credits is 'Allocation de plan encore valide (0 si le cycle est expiré)';

-- Vérification (3 lignes attendues)
select proname from pg_proc
where proname in ('grant_plan_credits', 'spend_credits', 'effective_plan_credits')
order by proname;
