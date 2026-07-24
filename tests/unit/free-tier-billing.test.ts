import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFreeTierLimits, decidePlatformRunBilling } from "../../lib/billing/free-tier";
import { FREE_TIER_MODEL } from "../../lib/billing/credits";
import { resolveModelOrDefault } from "../../lib/llm/resolve-model";
import { AgentManifestSchema, type AgentManifest } from "../../lib/agent/schema";

// ─── decidePlatformRunBilling ────────────────────────────────────────────────
// L'invariant central : l'entitlement (propriétaire, Pro, achat, abonnement)
// n'est PAS un paramètre de la décision — il ne peut donc jamais exonérer de
// payer une exécution sur clés plateforme.

test("decidePlatformRunBilling — solde suffisant = crédits, même sur listing gratuit", () => {
  assert.equal(
    decidePlatformRunBilling({ balanceCents: 100, minCreditsCents: 10, listingIsFree: true }),
    "credits",
  );
  assert.equal(
    decidePlatformRunBilling({ balanceCents: 100, minCreditsCents: 10, listingIsFree: false }),
    "credits",
  );
});

test("decidePlatformRunBilling — solde exactement au minimum = crédits", () => {
  assert.equal(
    decidePlatformRunBilling({ balanceCents: 10, minCreditsCents: 10, listingIsFree: false }),
    "credits",
  );
});

test("decidePlatformRunBilling — sans crédits sur listing gratuit = quota gratuit", () => {
  assert.equal(
    decidePlatformRunBilling({ balanceCents: 0, minCreditsCents: 10, listingIsFree: true }),
    "free_quota",
  );
});

test("decidePlatformRunBilling — sans crédits sur listing payant = refus (jamais de quota)", () => {
  assert.equal(
    decidePlatformRunBilling({ balanceCents: 9, minCreditsCents: 10, listingIsFree: false }),
    "insufficient_credits",
  );
});

// ─── applyFreeTierLimits ─────────────────────────────────────────────────────

function buildManifest(): AgentManifest {
  return AgentManifestSchema.parse({
    steps: [
      { type: "llm", model: "claude-opus-4-8", prompt: "Analyse {{sujet}}", outputKey: "analyse" },
      { type: "tool", tool: "web_search", params: { query: "{{sujet}}" }, outputKey: "recherche" },
      {
        type: "action",
        connector: "gmail",
        action: "GMAIL_SEND_EMAIL",
        params: { to: "a@b.c" },
        aiFills: {
          subject: { model: "gpt-5.5", prompt: "Un objet d'email pour {{analyse}}" },
        },
        outputKey: "envoi",
      },
      { type: "browser", goal: "Remplir le formulaire", model: "claude-opus-4-8" },
      {
        type: "parallel",
        branches: [
          { steps: [{ type: "llm", model: "gpt-5.5", prompt: "Résume {{recherche}}" }], outputKey: "resume" },
          { steps: [{ type: "tool", tool: "http_fetch", params: { url: "https://example.com" } }] },
        ],
      },
    ],
  });
}

test("applyFreeTierLimits — force FREE_TIER_MODEL sur les étapes llm", () => {
  const clamped = applyFreeTierLimits(buildManifest());
  const llm = clamped.steps[0];
  assert.equal(llm.type, "llm");
  if (llm.type === "llm") {
    assert.equal(llm.model, FREE_TIER_MODEL);
    // Le reste de l'étape est préservé.
    assert.equal(llm.prompt, "Analyse {{sujet}}");
    assert.equal(llm.outputKey, "analyse");
  }
});

test("applyFreeTierLimits — force le modèle des branches parallel", () => {
  const clamped = applyFreeTierLimits(buildManifest());
  const parallel = clamped.steps[4];
  assert.equal(parallel.type, "parallel");
  if (parallel.type === "parallel") {
    const branchLlm = parallel.branches[0].steps[0];
    assert.equal(branchLlm.type, "llm");
    if (branchLlm.type === "llm") assert.equal(branchLlm.model, FREE_TIER_MODEL);
    assert.equal(parallel.branches[0].outputKey, "resume");
  }
});

test("applyFreeTierLimits — force le modèle des remplissages IA (aiFills)", () => {
  const clamped = applyFreeTierLimits(buildManifest());
  const action = clamped.steps[2];
  assert.equal(action.type, "action");
  if (action.type === "action") {
    assert.equal(action.aiFills?.subject.model, FREE_TIER_MODEL);
    assert.equal(action.aiFills?.subject.prompt, "Un objet d'email pour {{analyse}}");
    // Les params de l'action ne bougent pas.
    assert.deepEqual(action.params, { to: "a@b.c" });
  }
});

test("applyFreeTierLimits — force le modèle du pilotage navigateur", () => {
  const clamped = applyFreeTierLimits(buildManifest());
  const browser = clamped.steps[3];
  assert.equal(browser.type, "browser");
  if (browser.type === "browser") {
    assert.equal(browser.model, FREE_TIER_MODEL);
    assert.equal(browser.goal, "Remplir le formulaire");
  }
});

test("applyFreeTierLimits — étapes non-LLM et structure intactes", () => {
  const manifest = buildManifest();
  const clamped = applyFreeTierLimits(manifest);
  assert.equal(clamped.steps.length, manifest.steps.length);
  assert.deepEqual(clamped.steps[1], manifest.steps[1]); // tool inchangé
  assert.deepEqual(clamped.limits, manifest.limits);
  assert.deepEqual(clamped.outputs, manifest.outputs);
});

test("applyFreeTierLimits — ne mute pas le manifeste d'origine", () => {
  const manifest = buildManifest();
  applyFreeTierLimits(manifest);
  const llm = manifest.steps[0];
  if (llm.type === "llm") assert.equal(llm.model, "claude-opus-4-8");
  const action = manifest.steps[2];
  if (action.type === "action") assert.equal(action.aiFills?.subject.model, "gpt-5.5");
});

// ─── Cohérence catalogue ─────────────────────────────────────────────────────
// Si FREE_TIER_MODEL sortait du catalogue, resolveModelOrDefault retomberait
// silencieusement sur le modèle par défaut (plus cher) : le bridage serait mort.

test("FREE_TIER_MODEL résout vers lui-même dans le catalogue", () => {
  const resolved = resolveModelOrDefault(FREE_TIER_MODEL);
  assert.equal(resolved.catalogId, FREE_TIER_MODEL);
});
