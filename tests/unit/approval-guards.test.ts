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
  isSensitiveWriteStep,
  isWriteActionStep,
  flattenPausingParallels,
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

// ── isWriteActionStep : garde anti-rejeu du retry orchestrateur ─────────────
// Distincte de isSensitiveWriteStep : elle ne fait PAS d'exception pour les
// espaces Google perso (un append_row rejoué duplique la ligne, même s'il
// n'exige pas de validation humaine).

test("isWriteActionStep — une écriture externe n'est pas rejouable", () => {
  assert.equal(isWriteActionStep({ type: "action", connector: "gmail", action: "gmail.send", params: {} } as never), true);
  assert.equal(isWriteActionStep({ type: "action", connector: "stripe", action: "stripe.charge", params: {} } as never), true);
  assert.equal(isWriteActionStep({ type: "action", connector: "notion", action: "notion.create_page", params: {} } as never), true);
});

test("isWriteActionStep — les espaces Google perso restent des écritures (≠ isSensitiveWriteStep)", () => {
  const appendRow = { type: "action", connector: "google_sheets", action: "google_sheets.append_row", params: {} } as never;
  // Pas de validation humaine…
  assert.equal(isSensitiveWriteStep(appendRow), false);
  // …mais surtout pas rejouable : un retry duplique la ligne.
  assert.equal(isWriteActionStep(appendRow), true);
});

test("isWriteActionStep — une lecture reste rejouable", () => {
  assert.equal(isWriteActionStep({ type: "action", connector: "gmail", action: "gmail.list_messages", params: {} } as never), false);
  assert.equal(isWriteActionStep({ type: "action", connector: "hubspot", action: "hubspot.search_contacts", params: {} } as never), false);
  assert.equal(isWriteActionStep({ type: "action", connector: "drive", action: "drive.get_file", params: {} } as never), false);
});

test("isWriteActionStep — seules les étapes action sont concernées", () => {
  assert.equal(isWriteActionStep({ type: "llm", model: "gpt-5.4-mini", prompt: "p" } as never), false);
  assert.equal(isWriteActionStep({ type: "tool", tool: "web_search", params: {} } as never), false);
});

// ── flattenPausingParallels : correction d'indexation, pas cosmétique ───────
// Une pause dans une branche produit un step_index composite (i*100+b*10+s)
// persisté en base ; resume_from_step devient alors hors bornes et le run est
// clos « completed » à vide, écritures des branches sœurs perdues.

test("flattenPausingParallels — un parallel porteur d'une approbation est aplati", () => {
  const m = manifest([
    llm("a"),
    {
      type: "parallel",
      branches: [
        { steps: [llm("b1"), { type: "approval", label: "v", payloadTemplate: "{{b1}}", outputKey: "ok" }] },
        { steps: [llm("b2")] },
      ],
      outputKey: "tout",
    },
  ]);
  const flat = flattenPausingParallels(m);
  assert.ok(!flat.steps.some((s) => s.type === "parallel"));
  // Ordre préservé : branche 1 puis branche 2.
  assert.deepEqual(flat.steps.map((s) => s.type), ["llm", "llm", "approval", "llm"]);
});

test("flattenPausingParallels — un parallel SANS pause est laissé intact", () => {
  const m = manifest([
    llm("a"),
    { type: "parallel", branches: [{ steps: [llm("b1")] }, { steps: [llm("b2")] }], outputKey: "tout" },
  ]);
  const flat = flattenPausingParallels(m);
  assert.equal(flat.steps[1].type, "parallel");
  // Référence identique : aucune copie inutile quand rien ne change.
  assert.equal(flat, m);
});

test("flattenPausingParallels — idempotent (point fixe)", () => {
  const m = manifest([
    { type: "parallel", branches: [{ steps: [{ type: "ask", question: "q", outputKey: "r" }] }], outputKey: "t" },
  ]);
  const once = flattenPausingParallels(m);
  const twice = flattenPausingParallels(once);
  assert.deepEqual(twice.steps, once.steps);
});

test("ensureApprovalGuards aplatit AVANT de poser les approbations", () => {
  // gmail.send dans une branche + un ask ailleurs dans le même parallel :
  // après garde, aucun parallel ne subsiste et l'envoi est immédiatement
  // précédé de sa validation — index cohérents pour la reprise.
  const guarded = ensureApprovalGuards(
    manifest([
      {
        type: "parallel",
        branches: [
          { steps: [{ type: "ask", question: "quel objet ?", outputKey: "obj" }] },
          { steps: [gmailSend("corps")] },
        ],
        outputKey: "tout",
      },
    ]),
  );
  assert.ok(!guarded.steps.some((s) => s.type === "parallel"));
  const sendIdx = guarded.steps.findIndex((s) => s.type === "action");
  assert.ok(sendIdx > 0);
  assert.equal(guarded.steps[sendIdx - 1].type, "approval");
  // Et le résultat reste un point fixe de la garde.
  assert.deepEqual(ensureApprovalGuards(guarded).steps, guarded.steps);
});

// ── Slugs Composio UPPER_SNAKE : les lectures ne déclenchent pas de validation ──
// L'ancienne détection testait un préfixe sur le segment après le dernier
// point : « NOTION_FETCH_EMAILS » (pas de point) → verbe = slug entier → jamais
// une lecture → l'utilisateur validait des lectures. On tokenise désormais.

test("UPPER_SNAKE — une lecture (slug brut) ne demande pas de validation", () => {
  for (const action of ["NOTION_QUERY_DATABASE", "GMAIL_FETCH_EMAILS", "NOTION_FETCH_DATA", "SLACK_LIST_CHANNELS"]) {
    assert.equal(
      isSensitiveWriteStep({ type: "action", connector: "notion", action, params: {} } as never),
      false,
      `${action} classée écriture sensible`,
    );
  }
});

test("UPPER_SNAKE — une écriture (slug brut) reste gardée", () => {
  for (const action of ["NOTION_INSERT_ROW_DATABASE", "GMAIL_SEND_EMAIL", "SLACK_SEND_MESSAGE"]) {
    assert.equal(
      isSensitiveWriteStep({ type: "action", connector: "notion", action, params: {} } as never),
      true,
      `${action} non gardée`,
    );
  }
});

test("deny-by-default — un token d'écriture PRIME sur un token de lecture", () => {
  // « search_and_replace », « find_and_delete » : lecture + écriture = écriture.
  assert.equal(isSensitiveWriteStep({ type: "action", connector: "x", action: "x.search_and_replace", params: {} } as never), true);
  assert.equal(isSensitiveWriteStep({ type: "action", connector: "x", action: "FIND_AND_DELETE_ROWS", params: {} } as never), true);
});

test("alias de connecteur canonisés — « Google Sheets » ne redemande pas de validation", () => {
  for (const connector of ["google_sheets", "Google Sheets", "gsheets".replace("gs", "googles")]) {
    assert.equal(
      isSensitiveWriteStep({ type: "action", connector, action: "google_sheets.append_row", params: {} } as never),
      false,
      `alias « ${connector} » non canonisé`,
    );
  }
});
