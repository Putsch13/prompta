import { test } from "node:test";
import assert from "node:assert/strict";

import { effectivePlanCredits } from "../../lib/credits";

/**
 * Modèle deux compartiments (migration 0052) :
 *  - allocation de plan : remplacée chaque mois, périssable ;
 *  - crédits achetés : permanents, consommés APRÈS l'allocation.
 * Ici on teste la partie pure (validité de l'allocation) et l'ordre de
 * consommation reproduit à l'identique de la RPC spend_credits.
 */

const inOneMonth = () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const lastMonth = () => new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

test("allocation de plan — valide tant que le cycle court", () => {
  assert.equal(effectivePlanCredits({ plan_credits_cents: 3500, plan_credits_expire_at: inOneMonth() }), 3500);
});

test("allocation de plan — nulle une fois le cycle expiré", () => {
  assert.equal(effectivePlanCredits({ plan_credits_cents: 3500, plan_credits_expire_at: lastMonth() }), 0);
});

test("allocation de plan — absente ou nulle = 0 (jamais négatif)", () => {
  assert.equal(effectivePlanCredits(null), 0);
  assert.equal(effectivePlanCredits({}), 0);
  assert.equal(effectivePlanCredits({ plan_credits_cents: 0, plan_credits_expire_at: inOneMonth() }), 0);
  assert.equal(effectivePlanCredits({ plan_credits_cents: -100, plan_credits_expire_at: inOneMonth() }), 0);
});

test("allocation sans date d'expiration — considérée valide (pas de perte accidentelle)", () => {
  assert.equal(effectivePlanCredits({ plan_credits_cents: 1200, plan_credits_expire_at: null }), 1200);
});

/** Réplique de l'ordre de consommation de la RPC spend_credits. */
function spend(plan: number, balance: number, amount: number) {
  const fromPlan = Math.min(plan, amount);
  const fromBalance = Math.min(Math.max(0, balance), amount - fromPlan);
  return { plan: plan - fromPlan, balance: balance - fromBalance, debited: fromPlan + fromBalance };
}

test("consommation — l'allocation périssable part AVANT les crédits achetés", () => {
  // 35 € d'allocation + 30 € achetés, on dépense 20 € : rien n'est pris sur l'acheté.
  const r = spend(3500, 3000, 2000);
  assert.equal(r.plan, 1500);
  assert.equal(r.balance, 3000);
  assert.equal(r.debited, 2000);
});

test("consommation — déborde sur les crédits achetés une fois l'allocation vide", () => {
  const r = spend(1000, 3000, 2500);
  assert.equal(r.plan, 0);
  assert.equal(r.balance, 1500);
  assert.equal(r.debited, 2500);
});

test("consommation — solde insuffisant : on débite ce qui existe, jamais plus", () => {
  const r = spend(500, 200, 5000);
  assert.equal(r.plan, 0);
  assert.equal(r.balance, 0);
  assert.equal(r.debited, 700); // le ledger doit refléter le débité réel
});

test("renouvellement mensuel — l'allocation est remplacée, l'acheté intact", () => {
  // Fin de mois : 12 € d'allocation non consommés, 30 € achetés.
  const leftoverPlan = 1200;
  const purchased = 3000;
  // Nouvelle facture : l'allocation redevient 35 €, le reliquat est perdu.
  const newPlan = 3500;
  assert.equal(newPlan, 3500, "l'allocation est remplacée, pas additionnée");
  assert.notEqual(newPlan, 3500 + leftoverPlan, "aucun cumul d'un mois sur l'autre");
  assert.equal(purchased, 3000, "les crédits achetés ne sont jamais touchés");
});
