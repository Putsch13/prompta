import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLANS,
  PLAN_ORDER,
  canPublishOnPlan,
  normalizePlanId,
  WELCOME_CREDIT_CENTS,
} from "../../lib/billing/plans";

test("plans — catalogue cohérent (prix croissants, quotas croissants)", () => {
  assert.equal(PLAN_ORDER[0], "free");
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

test("plans — la marge est préservée (crédits inclus < prix du plan)", () => {
  for (const id of PLAN_ORDER) {
    const p = PLANS[id];
    if (p.priceCents === 0) continue;
    assert.ok(
      p.monthlyCreditCents < p.priceCents,
      `${id} : crédits inclus (${p.monthlyCreditCents}) ≥ prix (${p.priceCents})`,
    );
  }
});

test("plans — freemium : 1 agent publié, 2 € de bienvenue", () => {
  assert.equal(PLANS.free.publishedAgentLimit, 1);
  assert.equal(PLANS.free.priceCents, 0);
  assert.equal(WELCOME_CREDIT_CENTS, 200);
});

test("canPublishOnPlan — quota respecté et illimité géré", () => {
  assert.equal(canPublishOnPlan(PLANS.free, 0).allowed, true);
  assert.equal(canPublishOnPlan(PLANS.free, 1).allowed, false);
  assert.equal(canPublishOnPlan(PLANS.starter, 4).allowed, true);
  assert.equal(canPublishOnPlan(PLANS.starter, 5).allowed, false);
  assert.equal(canPublishOnPlan(PLANS.scale, 9999).allowed, true);
  assert.equal(canPublishOnPlan(PLANS.scale, 9999).limit, null);
});

test("normalizePlanId — legacy et inconnus retombent proprement", () => {
  assert.equal(normalizePlanId(null), "free");
  assert.equal(normalizePlanId("pro"), "pro");
  assert.equal(normalizePlanId("scale"), "scale");
  // Legacy « pro » 19,99 € et valeurs inconnues → starter (jamais un crash).
  assert.equal(normalizePlanId("platform_pro"), "starter");
  assert.equal(normalizePlanId("ancienne_valeur"), "starter");
});
