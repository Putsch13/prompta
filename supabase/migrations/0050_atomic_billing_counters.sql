-- 0050 — Compteurs billing atomiques : supprime trois read-then-write non
-- atomiques côté JS (perte d'incréments sous concurrence).
--   1. add_credits : deux grants concurrents (achat pack + invoice.paid)
--      perdaient un crédit (lecture du solde puis upsert).
--   2. consume_free_run_quota : N requêtes parallèles à limite-1 passaient
--      toutes ; l'insert initial concurrent échouait en silence.
--   3. record_platform_daily_cost : settles concurrents perdaient des
--      incréments du compteur journalier du coupe-circuit.
-- Le JS garde un fallback read-then-write si la RPC n'est pas migrée (drift prod).

-- 1. Crédit atomique du solde (le ledger reste inséré côté JS, idempotent via
--    l'index unique 0047 sur (stripe_session_id, kind)).
create or replace function add_credits(
  p_user_id uuid,
  p_amount_cents int
) returns void
language plpgsql
as $$
begin
  insert into user_credits (user_id, balance_cents, updated_at)
    values (p_user_id, p_amount_cents, now())
    on conflict (user_id) do update
      set balance_cents = user_credits.balance_cents + excluded.balance_cents,
          updated_at = now();
end;
$$;

-- 2. Consommation atomique du quota gratuit journalier.
--    Reset de jour + incrément conditionnel dans un seul UPDATE : deux
--    requêtes concurrentes à limite-1 ne passent pas toutes les deux.
create or replace function consume_free_run_quota(
  p_user_id uuid,
  p_limit int
) returns boolean
language plpgsql
as $$
declare
  v_rows int;
begin
  -- Première consommation : la ligne n'existe pas encore. FOUND est vrai si
  -- l'insert a réellement créé la ligne (faux si une requête concurrente a gagné).
  insert into free_run_quota (user_id, runs_today, last_reset)
    values (p_user_id, 1, current_date)
    on conflict (user_id) do nothing;
  if found then
    return true;
  end if;

  update free_run_quota
    set runs_today = case when last_reset is distinct from current_date
                          then 1 else runs_today + 1 end,
        last_reset = current_date
    where user_id = p_user_id
      and (last_reset is distinct from current_date or runs_today < p_limit);

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- 3. Compteur journalier du coupe-circuit plateforme (FOR UPDATE, style 0027).
create or replace function record_platform_daily_cost(
  p_cost_cents numeric,
  p_margin_cents numeric,
  p_cap_cents numeric
) returns void
language plpgsql
as $$
declare
  v_cost numeric;
  v_margin numeric;
  v_paused boolean;
  v_day date;
begin
  insert into platform_credit_guard (id) values (1) on conflict (id) do nothing;

  select daily_cost_cents, daily_margin_cents, is_paused, guard_day
    into v_cost, v_margin, v_paused, v_day
    from platform_credit_guard
    where id = 1
    for update;

  if v_day is distinct from current_date then
    v_cost := 0;
    v_margin := 0;
    v_paused := false;
  end if;

  v_cost := v_cost + p_cost_cents;
  v_margin := v_margin + p_margin_cents;

  update platform_credit_guard
    set daily_cost_cents = v_cost,
        daily_margin_cents = v_margin,
        guard_day = current_date,
        is_paused = v_paused or v_cost >= p_cap_cents,
        updated_at = now()
    where id = 1;
end;
$$;

comment on function add_credits is 'Atomique : crédite le solde (insert si absent), le ledger reste côté appelant';
comment on function consume_free_run_quota is 'Atomique : consomme une run du quota gratuit journalier (reset de jour inclus)';
comment on function record_platform_daily_cost is 'Atomique : incrémente le coût/marge journaliers et déclenche le coupe-circuit au plafond (FOR UPDATE)';
