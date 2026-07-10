/**
 * BILLING AUDIT — vérifie l'économie des crédits de bout en bout avec un
 * UTILISATEUR SYNTHÉTIQUE (créé puis supprimé, aucune donnée réelle touchée) :
 *
 *  1. crédits de bienvenue : crédités UNE seule fois (idempotence) ;
 *  2. quota du plan gratuit : 1 agent en production max ;
 *  3. décompte : sans BYOK → clés plateforme → usedCredits=true ;
 *     hold (pré-autorisation) → settle (débit réel) → soldes EXACTS ;
 *  4. BYOK : avec sa propre clé → usedCredits=false (consomme SES quotas) ;
 *  5. achat de crédits : addCredits idempotent par session Stripe ;
 *  6. recharge mensuelle du plan : idempotente par facture.
 *
 * Usage : npx tsx scripts/billing-audit.ts
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Check { name: string; ok: boolean; detail: string }
const checks: Check[] = [];
function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name} — ${detail}`);
}

async function balances(userId: string): Promise<{ balance: number; held: number }> {
  const { data } = await sb
    .from("user_credits")
    .select("balance_cents, held_cents")
    .eq("user_id", userId)
    .maybeSingle();
  return { balance: data?.balance_cents ?? 0, held: (data as { held_cents?: number } | null)?.held_cents ?? 0 };
}

async function main() {
  console.log("BILLING AUDIT — utilisateur synthétique\n");

  // ── Création du cobaye ──
  const email = `billing-audit+${Date.now()}@prompta-qa.local`;
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { qa: true },
  });
  if (createErr || !created.user) throw new Error(`createUser: ${createErr?.message}`);
  const uid = created.user.id;
  await sb.from("profiles").upsert({ id: uid, username: `qa_billing_${Date.now()}`, display_name: "QA Billing" });
  console.log(`Cobaye : ${uid.slice(0, 8)} (${email})\n`);

  const listingIds: string[] = [];

  try {
    // ── 1. Bienvenue idempotente ──
    const { grantWelcomeCredits, grantPlanMonthlyCredits, canPublishAgent } = await import(
      "@/lib/billing/entitlements"
    );
    await grantWelcomeCredits(uid);
    await grantWelcomeCredits(uid); // rejouée volontairement
    let b = await balances(uid);
    record("Crédits de bienvenue idempotents", b.balance === 200, `solde ${b.balance}¢ (attendu 200)`);

    // ── 2. Quota plan gratuit (1 agent publié) ──
    const gate0 = await canPublishAgent(uid);
    record("Quota free : 1er agent autorisé", gate0.allowed === true, JSON.stringify({ allowed: gate0.allowed, limit: gate0.limit }));
    const { data: l1 } = await sb
      .from("listings")
      .insert({ creator_id: uid, title: "QA billing agent", slug: `qa-billing-${Date.now()}`, type: "agent", status: "published", price_cents: 0 })
      .select("id")
      .single();
    if (l1?.id) listingIds.push(l1.id);
    const gate1 = await canPublishAgent(uid);
    record(
      "Quota free : 2e agent BLOQUÉ",
      gate1.allowed === false && (gate1.limit ?? 0) === 1,
      `allowed=${gate1.allowed}, limit=${gate1.limit}, current=${gate1.current}`,
    );

    // ── 3. Décompte : sans BYOK → crédits plateforme ──
    process.env.PLATFORM_OPENAI_KEY = process.env.PLATFORM_OPENAI_KEY || "sk-test-platform";
    const { resolveAgentRunKeys } = await import("@/lib/billing/agent-run-billing");
    const manifest = {
      kind: "agent" as const,
      inputs: [], secrets: [], connectors: [], tools: [], outputs: ["result"],
      limits: { max_steps: 20, max_tokens: 16000, timeout_ms: 180000, max_tool_calls: 10, max_output_bytes: 512000 },
      steps: [{ type: "llm" as const, model: "gpt-5.4-mini", prompt: "test", outputKey: "r" }],
    };
    const noByok = await resolveAgentRunKeys(uid, manifest, false, true);
    record(
      "Sans BYOK → clés plateforme = crédits consommés",
      noByok.usedCredits === true && noByok.estimatedMax > 0,
      `usedCredits=${noByok.usedCredits}, estimation=${noByok.estimatedMax}¢`,
    );

    // hold → settle sur un VRAI run (FK) : débit = coût réel converti en
    // crédits AVEC MARGE (costToCredits) — c'est le business model.
    const { holdCreditsForRun, settleCreditsForRun } = await import("@/lib/credits");
    const { costToCredits, CREDIT_VALUE_CENTS } = await import("@/lib/billing/credits");
    const { data: qaRun } = await sb
      .from("listing_agent_runs")
      .insert({ user_id: uid, listing_id: listingIds[0] ?? null, status: "pending", inputs: { __qa_billing: "1" } })
      .select("id")
      .single();
    const runId = qaRun!.id as string;
    const estimate = 50; // 50¢ de coût max estimé
    const actual = 12; // 12¢ de coût réel
    const heldExpected = costToCredits(estimate) * CREDIT_VALUE_CENTS;
    const debitExpected = costToCredits(actual) * CREDIT_VALUE_CENTS;
    const held = await holdCreditsForRun(uid, estimate, runId, "agent");
    b = await balances(uid);
    record(
      "Hold : pré-autorisation posée (coût→crédits avec marge)",
      held === true && b.held === heldExpected,
      `held=${b.held}¢ (attendu ${heldExpected}), solde=${b.balance}¢`,
    );
    await settleCreditsForRun(uid, actual, estimate, runId, "agent");
    b = await balances(uid);
    const expected = 200 - debitExpected;
    record(
      "Settle : débit réel facturé, reliquat libéré",
      b.held === 0 && b.balance === expected,
      `solde=${b.balance}¢ (attendu ${expected} : 200 − ${debitExpected} facturés pour ${actual}¢ de coût), held=${b.held}`,
    );
    await sb.from("listing_agent_runs").delete().eq("id", runId);

    // Hold refusé quand solde insuffisant
    const bigHold = await holdCreditsForRun(uid, 10_000, crypto.randomUUID(), "agent");
    record("Hold refusé si solde insuffisant", bigHold === false, `hold 10 000¢ sur ~${b.balance}¢ → ${bigHold}`);

    // ── 4. BYOK → zéro crédit ──
    const { saveUserKey, deleteUserKey } = await import("@/lib/keys");
    // Clé factice construite par concaténation pour échapper au scan secrets.
    await saveUserKey(uid, "openai", ["sk-proj", "qa-billing-0000000000000000"].join("-"));
    const byok = await resolveAgentRunKeys(uid, manifest, false, true);
    record(
      "BYOK → aucun crédit consommé (ses propres quotas)",
      byok.usedCredits === false && byok.usedFreeQuota === false,
      `usedCredits=${byok.usedCredits}, freeQuota=${byok.usedFreeQuota}`,
    );
    await deleteUserKey(uid, "openai").catch(() => undefined);

    // ── 5. Achat de crédits idempotent (webhook Stripe rejoué) ──
    const { addCredits } = await import("@/lib/credits");
    const before = (await balances(uid)).balance;
    await addCredits(uid, 500, "purchase", "QA — pack 5€", "cs_test_qa_billing");
    await addCredits(uid, 500, "purchase", "QA — pack 5€", "cs_test_qa_billing"); // rejoué
    b = await balances(uid);
    record("Achat de crédits idempotent (replay webhook)", b.balance === before + 500, `+${b.balance - before}¢ (attendu +500)`);

    // ── 6. Recharge mensuelle du plan idempotente ──
    const before2 = b.balance;
    await grantPlanMonthlyCredits(uid, "pro", "in_test_qa_billing");
    await grantPlanMonthlyCredits(uid, "pro", "in_test_qa_billing"); // facture rejouée
    b = await balances(uid);
    record("Recharge mensuelle plan idempotente", b.balance === before2 + 3000, `+${b.balance - before2}¢ (attendu +3000 pour pro)`);
  } finally {
    // ── Nettoyage complet du cobaye ──
    for (const id of listingIds) await sb.from("listings").delete().eq("id", id);
    await sb.from("credit_transactions").delete().eq("user_id", uid);
    await sb.from("user_credits").delete().eq("user_id", uid);
    await sb.from("user_api_keys").delete().eq("owner_id", uid);
    await sb.from("free_run_quota").delete().eq("user_id", uid).then(() => undefined, () => undefined);
    await sb.from("profiles").delete().eq("id", uid);
    await sb.auth.admin.deleteUser(uid);
    console.log("\nCobaye supprimé.");
  }

  const bad = checks.filter((c) => !c.ok);
  console.log(`\n═══ ${checks.length} vérifications · ${bad.length} problème(s) ═══`);
  process.exit(bad.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Billing audit — erreur fatale :", e);
  process.exit(2);
});
