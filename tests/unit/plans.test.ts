import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLANS,
  PLAN_ORDER,
  MAX_CREDIT_GRANT_RATIO,
  maxMonthlyGrantCents,
  canPublishOnPlan,
  normalizePlanId,
  WELCOME_CREDIT_CENTS,
} from "../../lib/billing/plans";
import { MARKUP } from "../../lib/billing/credits";
import { CREDIT_PACKS } from "../../lib/credit-packs";

/** Frais Stripe pire cas retenus pour l'invariant (carte EU : 1,5 % + 0,25 €). */
const STRIPE_PCT = 0.015;
const STRIPE_FLAT_CENTS = 25;

test("plans — catalogue cohérent (3 offres, prix et crédits croissants)", () => {
  assert.deepEqual(PLAN_ORDER, ["free", "illimite", "pro"]);
  let prevPrice = -1;
  let prevCredits = -1;
  for (const id of PLAN_ORDER) {
    const p = PLANS[id];
    assert.ok(p.priceCents > prevPrice, `${id} : prix non croissant`);
    assert.ok(p.monthlyCreditCents >= prevCredits, `${id} : crédits non croissants`);
    assert.ok(p.features.length >= 4, `${id} : features marketing insuffisantes`);
    prevPrice = p.priceCents;
    prevCredits = p.monthlyCreditCents;
  }
});

test("plans — invariant « com ≥ 20 % » même à consommation 100 % des crédits", () => {
  for (const id of PLAN_ORDER) {
    const p = PLANS[id];
    if (p.priceCents === 0) continue;
    // Plafond structurel respecté par la grille affichée.
    assert.ok(
      p.monthlyCreditCents <= maxMonthlyGrantCents(p.priceCents),
      `${id} : crédits inclus (${p.monthlyCreditCents}) > ${MAX_CREDIT_GRANT_RATIO} × prix (${p.priceCents})`,
    );
    // Marge nette pire cas : prix − coût API (crédits ÷ markup) − frais Stripe.
    const worstApiCost = p.monthlyCreditCents / MARKUP;
    const stripeFees = p.priceCents * STRIPE_PCT + STRIPE_FLAT_CENTS;
    const margin = p.priceCents - worstApiCost - stripeFees;
    assert.ok(
      margin >= 0.2 * p.priceCents,
      `${id} : marge pire cas ${(margin / 100).toFixed(2)} € < 20 % du prix`,
    );
  }
});

test("plans — le plafond structurel protège aussi les factures legacy/prorata", () => {
  // Ancien Starter 19 € mappé sur Illimité : le grant est borné par le payé.
  const legacyPaid = 1900;
  const granted = Math.min(PLANS.illimite.monthlyCreditCents, maxMonthlyGrantCents(legacyPaid));
  assert.ok(granted < PLANS.illimite.monthlyCreditCents, "grant legacy non borné");
  const margin = legacyPaid - granted / MARKUP - (legacyPaid * STRIPE_PCT + STRIPE_FLAT_CENTS);
  assert.ok(margin >= 0.2 * legacyPaid, "facture legacy 19 € déficitaire");
  // Facture à 0 € (coupon 100 %, prorata négatif) → aucun crédit accordé.
  assert.equal(maxMonthlyGrantCents(0), 0);
  assert.equal(maxMonthlyGrantCents(-500), 0);
});

test("packs de crédits — bonus toujours sous le plafond structurel", () => {
  for (const pack of CREDIT_PACKS) {
    assert.ok(
      pack.creditsCents <= maxMonthlyGrantCents(pack.amountCents),
      `${pack.id} : bonus au-dessus du ratio ${MAX_CREDIT_GRANT_RATIO}`,
    );
  }
});

test("plans — freemium : 1 agent gardé, 2 € de bienvenue", () => {
  assert.equal(PLANS.free.publishedAgentLimit, 1);
  assert.equal(PLANS.free.priceCents, 0);
  assert.equal(WELCOME_CREDIT_CENTS, 200);
});

test("plans — payants : agents gardés illimités", () => {
  assert.equal(PLANS.illimite.publishedAgentLimit, null);
  assert.equal(PLANS.pro.publishedAgentLimit, null);
});

test("plans — multi-desk : 1 poste sauf Pro (10)", () => {
  assert.equal(PLANS.free.deskLimit, 1);
  assert.equal(PLANS.illimite.deskLimit, 1);
  assert.equal(PLANS.pro.deskLimit, 10);
});

test("plans — aucune promesse de report des crédits inclus", () => {
  // Les crédits de plan sont use-it-or-lose-it (migration 0052) : le marketing
  // ne doit plus promettre l'inverse, sinon on vend ce que le code ne fait pas.
  for (const id of PLAN_ORDER) {
    for (const feature of PLANS[id].features) {
      // « non reportable » est la formulation ATTENDUE : seule la promesse
      // positive (non précédée de « non ») est interdite.
      assert.ok(
        !/(?<!non\s)(cumulables?|reste acquis|report[ée]s?|reportables?)\b/i.test(feature),
        `${id} : « ${feature} » promet un report que le code ne fait plus`,
      );
    }
  }
});

test("canPublishOnPlan — quota respecté et illimité géré", () => {
  assert.equal(canPublishOnPlan(PLANS.free, 0).allowed, true);
  assert.equal(canPublishOnPlan(PLANS.free, 1).allowed, false);
  assert.equal(canPublishOnPlan(PLANS.illimite, 9999).allowed, true);
  assert.equal(canPublishOnPlan(PLANS.pro, 9999).allowed, true);
  assert.equal(canPublishOnPlan(PLANS.pro, 9999).limit, null);
});

test("normalizePlanId — legacy et inconnus retombent proprement", () => {
  assert.equal(normalizePlanId(null), "free");
  assert.equal(normalizePlanId("free"), "free");
  assert.equal(normalizePlanId("illimite"), "illimite");
  assert.equal(normalizePlanId("pro"), "pro");
  // Legacy pré-refonte : Scale → Pro ; Starter, très ancien pro et inconnus → Illimité.
  assert.equal(normalizePlanId("scale"), "pro");
  assert.equal(normalizePlanId("starter"), "illimite");
  assert.equal(normalizePlanId("platform_pro"), "illimite");
  assert.equal(normalizePlanId("pro_legacy"), "illimite");
  assert.equal(normalizePlanId("ancienne_valeur"), "illimite");
});
