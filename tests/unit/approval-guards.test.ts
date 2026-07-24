/**
 * Invariants RUNTIME des garde-fous d'approbation (lib/agent/approval-guards),
 * sur lesquels s'appuient la route /api/run/agent et le worker :
 *  - idempotence (pas de double approbation pour la même action) ;
 *  - préfixe d'un manifeste gardé = point fixe (reprises, replan) ;
 *  - couture replan « préfixe exécuté + queue re-gardée » = point fixe ;
 *  - règle d'application au claim (run frais / repris tamponné / legacy).
 * Le comportement d'insertion de base est testé dans
 * tests/unit/extension-instant-agent.test.ts (via le réexport historique).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureApprovalGuards,
  hasApprovalGuardStamp,
  shouldApplyApprovalGuards,
  APPROVAL_GUARD_STAMP_KEY,
  APPROVAL_GUARD_STAMP_VALUE,
} from "../../lib/agent/approval-guards";
import { AgentManifestSchema, type AgentManifest } from "../../lib/agent/schema";

function manifest(steps: unknown[]): AgentManifest {
  return AgentManifestSchema.parse({ kind: "agent", steps });
}

const llm = (key: string) => ({ type: "llm", model: "gpt-5.4-mini", prompt: "p", outputKey: key });
const gmailSend = (body: string) => ({
  type: "action",
  connector: "gmail",
  action: "gmail.send",
  params: { to: "x@y.z", subject: "s", body },
});
const slackPost = (text: string) => ({
  type: "action",
  connector: "slack",
  action: "slack.post_message",
  params: { channel: "C", text },
});

/** Manifeste « agent publié » typique : deux écritures sensibles SANS approval. */
function unguardedManifest(): AgentManifest {
  return manifest([
    llm("brouillon"),
    gmailSend("{{brouillon}}"),
    llm("annonce"),
    slackPost("{{annonce}}"),
  ]);
}

test("agent publié sans approval : la garde runtime insère une validation avant CHAQUE écriture", () => {
  const guarded = ensureApprovalGuards(unguardedManifest());
  assert.equal(guarded.steps.length, 6);
  // Chaque envoi est immédiatement précédé de son approbation.
  for (let i = 0; i < guarded.steps.length; i++) {
    const step = guarded.steps[i];
    if (step.type === "action") {
      assert.equal(guarded.steps[i - 1].type, "approval", `étape ${i} non précédée d'une approbation`);
    }
  }
});

test("idempotence : re-garder un manifeste gardé n'insère RIEN (pas de double approbation)", () => {
  const once = ensureApprovalGuards(unguardedManifest());
  const twice = ensureApprovalGuards(once);
  assert.deepEqual(twice, once);
  // Et une troisième passe (claim → reprise → reprise) reste stable.
  assert.deepEqual(ensureApprovalGuards(twice), once);
});

test("idempotence : manifeste extension (déjà gardé à la création) re-gardé par le worker — inchangé", () => {
  // Le flux extension pose déjà ses approvals ; le worker re-garde au claim.
  const extensionManifest = manifest([
    llm("contenu"),
    { type: "approval", label: "Valider l'envoi", payloadTemplate: "{{contenu}}", outputKey: "ok" },
    gmailSend("{{ok}}"),
  ]);
  const reGuarded = ensureApprovalGuards(extensionManifest);
  assert.deepEqual(reGuarded, extensionManifest);
  assert.equal(reGuarded.steps.filter((s) => s.type === "approval").length, 1);
});

test("idempotence : écriture sensible en branche parallèle — une seule approbation, stable", () => {
  const m = manifest([
    llm("c"),
    {
      type: "parallel",
      branches: [
        { steps: [llm("x")], outputKey: "b1" },
        { steps: [gmailSend("{{c}}")], outputKey: "b2" },
      ],
      outputKey: "p",
    },
  ]);
  const once = ensureApprovalGuards(m);
  assert.equal(once.steps.filter((s) => s.type === "approval").length, 1);
  assert.deepEqual(ensureApprovalGuards(once), once);
});

test("tout préfixe d'un manifeste gardé est un point fixe de la garde (reprises sans décalage)", () => {
  const guarded = ensureApprovalGuards(unguardedManifest());
  // Y compris le préfixe qui coupe ENTRE une approbation et son écriture.
  for (let cut = 0; cut <= guarded.steps.length; cut++) {
    const prefix = { ...guarded, steps: guarded.steps.slice(0, cut) };
    assert.deepEqual(
      ensureApprovalGuards(prefix).steps,
      prefix.steps,
      `préfixe [0, ${cut}) modifié par la garde`,
    );
  }
});

test("couture replan : préfixe exécuté + queue re-gardée = point fixe (aucun décalage au claim suivant)", () => {
  const guarded = ensureApprovalGuards(unguardedManifest());
  for (let failIndex = 0; failIndex < guarded.steps.length; failIndex++) {
    // Même recollage que lib/extension/replan.ts : garde sur la QUEUE seule.
    const tailGuarded = ensureApprovalGuards({ ...guarded, steps: guarded.steps.slice(failIndex) });
    const repaired = {
      ...guarded,
      steps: [...guarded.steps.slice(0, failIndex), ...tailGuarded.steps],
    };
    // Le worker re-garde le manifeste réparé au claim : rien ne doit bouger.
    assert.deepEqual(
      ensureApprovalGuards(repaired).steps,
      repaired.steps,
      `couture à l'index ${failIndex} décalée par la re-garde`,
    );
  }
});

test("le manifeste gardé reste valide au schéma runtime", () => {
  const guarded = ensureApprovalGuards(unguardedManifest());
  assert.ok(AgentManifestSchema.safeParse(guarded).success);
});

test("règle d'application au claim : frais → garde ; repris tamponné → garde ; legacy repris → brut", () => {
  // Run frais (premier claim) : aucune coordonnée à préserver → garde.
  assert.equal(shouldApplyApprovalGuards(0, false), true);
  assert.equal(shouldApplyApprovalGuards(0, true), true);
  // Reprise d'un run tamponné (approbation, crash, replan) : ses index sont
  // déjà en coordonnées gardées → re-garder (déterministe, idempotent).
  assert.equal(shouldApplyApprovalGuards(3, true), true);
  // Reprise d'un run legacy NON tamponné (en vol au déploiement de la garde) :
  // insérer des approbations décalerait resume_from_step → manifeste brut.
  assert.equal(shouldApplyApprovalGuards(3, false), false);
});

test("tampon __guarded : détection stricte sur les inputs du run", () => {
  assert.equal(hasApprovalGuardStamp({ [APPROVAL_GUARD_STAMP_KEY]: APPROVAL_GUARD_STAMP_VALUE }), true);
  assert.equal(hasApprovalGuardStamp({ __guarded: "1", autre: "x" }), true);
  assert.equal(hasApprovalGuardStamp({ __guarded: "0" }), false);
  assert.equal(hasApprovalGuardStamp({}), false);
  assert.equal(hasApprovalGuardStamp(null), false);
  assert.equal(hasApprovalGuardStamp(undefined), false);
  assert.equal(hasApprovalGuardStamp("__guarded"), false);
});

test("coordonnées gardées : l'index d'une approbation insérée pointe bien la même étape après re-garde", () => {
  // Simule le cycle complet : garde au claim → pause à l'approbation insérée
  // (paused_at_step = index dans le manifeste gardé) → reprise : le worker
  // re-garde et doit retrouver la MÊME étape au même index.
  const guarded = ensureApprovalGuards(unguardedManifest());
  const approvalIndexes = guarded.steps
    .map((s, i) => (s.type === "approval" ? i : -1))
    .filter((i) => i >= 0);
  assert.ok(approvalIndexes.length >= 2);
  const reGuarded = ensureApprovalGuards(guarded);
  for (const idx of approvalIndexes) {
    assert.deepEqual(reGuarded.steps[idx], guarded.steps[idx]);
    // Et l'étape suivante (celle que l'approbation protège) est identique.
    assert.deepEqual(reGuarded.steps[idx + 1], guarded.steps[idx + 1]);
  }
});
