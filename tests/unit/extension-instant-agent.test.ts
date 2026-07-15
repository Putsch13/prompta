import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureApprovalGuards,
  isSensitiveWriteStep,
  computeMissingConnectors,
  buildPageContextBlock,
} from "../../lib/extension/instant-agent";
import { AgentManifestSchema, type AgentManifest } from "../../lib/agent/schema";

function manifest(steps: unknown[]): AgentManifest {
  return AgentManifestSchema.parse({ kind: "agent", steps });
}

test("écriture sensible : Shopify/gmail oui, espaces Google perso non", () => {
  assert.equal(
    isSensitiveWriteStep({ type: "action", connector: "shopify", action: "shopify.create_product", params: {} } as never),
    true,
  );
  assert.equal(
    isSensitiveWriteStep({ type: "action", connector: "gmail", action: "gmail.send", params: {} } as never),
    true,
  );
  assert.equal(
    isSensitiveWriteStep({ type: "action", connector: "google_sheets", action: "google_sheets.append_row", params: {} } as never),
    false,
  );
  assert.equal(
    isSensitiveWriteStep({ type: "action", connector: "shopify", action: "shopify.list_products", params: {} } as never),
    false,
  );
});

test("garde-fou : une approbation est insérée AVANT la première écriture sensible", () => {
  const m = manifest([
    { type: "llm", model: "gpt-5.4-mini", prompt: "prépare", outputKey: "contenu" },
    { type: "action", connector: "shopify", action: "shopify.create_product", params: { title: "{{contenu}}" } },
  ]);
  const guarded = ensureApprovalGuards(m);
  assert.equal(guarded.steps.length, 3);
  const approval = guarded.steps[1];
  assert.equal(approval.type, "approval");
  // Le payload montre la sortie amont, pas un texte vide.
  assert.ok("payloadTemplate" in approval && String(approval.payloadTemplate).includes("{{contenu}}"));
  // Le manifeste gardé reste valide au schéma.
  assert.ok(AgentManifestSchema.safeParse(guarded).success);
});

test("garde-fou : pas de doublon si le plan contient déjà une approbation en amont", () => {
  const m = manifest([
    { type: "llm", model: "gpt-5.4-mini", prompt: "prépare", outputKey: "contenu" },
    { type: "approval", label: "Valider", payloadTemplate: "{{contenu}}", outputKey: "ok" },
    { type: "action", connector: "gmail", action: "gmail.send", params: { to: "x@y.z", subject: "s", body: "{{ok}}" } },
  ]);
  const guarded = ensureApprovalGuards(m);
  assert.equal(guarded.steps.length, 3);
});

test("deny-by-default : une écriture au verbe inconnu (stripe.charge) est traitée comme sensible", () => {
  assert.equal(
    isSensitiveWriteStep({ type: "action", connector: "stripe", action: "stripe.charge", params: {} } as never),
    true,
  );
  assert.equal(
    isSensitiveWriteStep({ type: "action", connector: "hubspot", action: "hubspot.execute", params: {} } as never),
    true,
  );
  // Une lecture explicite reste non sensible.
  assert.equal(
    isSensitiveWriteStep({ type: "action", connector: "stripe", action: "stripe.list_charges", params: {} } as never),
    false,
  );
});

test("garde-fou : une écriture sensible DANS une branche parallèle est protégée", () => {
  const m = manifest([
    { type: "llm", model: "gpt-5.4-mini", prompt: "prépare", outputKey: "c" },
    {
      type: "parallel",
      branches: [
        { steps: [{ type: "llm", model: "gpt-5.4-mini", prompt: "x", outputKey: "x" }], outputKey: "b1" },
        { steps: [{ type: "action", connector: "gmail", action: "gmail.send", params: { to: "a@b.c", subject: "s", body: "{{c}}" } }], outputKey: "b2" },
      ],
      outputKey: "p",
    },
  ]);
  const guarded = ensureApprovalGuards(m);
  // Une approbation est insérée AVANT le bloc parallèle contenant l'envoi.
  assert.equal(guarded.steps[1].type, "approval");
  assert.ok(AgentManifestSchema.safeParse(guarded).success);
});

test("garde-fou : les créations Google perso ne déclenchent PAS d'approbation", () => {
  const m = manifest([
    { type: "llm", model: "gpt-5.4-mini", prompt: "prépare", outputKey: "lignes" },
    { type: "action", connector: "google_sheets", action: "google_sheets.create_spreadsheet", params: { title: "t" }, outputKey: "c" },
    { type: "action", connector: "google_sheets", action: "google_sheets.append_row", params: { spreadsheet_id: "{{c}}", values: "{{lignes}}" } },
  ]);
  assert.equal(ensureApprovalGuards(m).steps.length, 3);
});

test("connecteurs manquants : normalisation des alias (google_sheets ≡ googlesheets)", () => {
  const m = manifest([
    { type: "action", connector: "google_sheets", action: "google_sheets.append_row", params: {} },
    { type: "action", connector: "shopify", action: "shopify.create_product", params: {} },
    {
      type: "parallel",
      branches: [{ steps: [{ type: "action", connector: "hubspot", action: "hubspot.list_contacts", params: {} }], outputKey: "b" }],
      outputKey: "p",
    },
  ]);
  const missing = computeMissingConnectors(m, new Set(["googlesheets", "gmail"]));
  assert.deepEqual(missing.sort(), ["hubspot", "shopify"]);
});

test("contexte de page : encadré comme donnée non fiable, sélection prioritaire visible", () => {
  const block = buildPageContextBlock({
    url: "https://exemple.fr/produit",
    title: "Produit X",
    selection: "la sélection de Florent",
    content: "contenu de la page",
    links: ["Tarifs → https://exemple.fr/tarifs"],
  });
  assert.ok(block.includes("DONNÉES NON FIABLES"));
  assert.ok(block.includes("SÉLECTION DE L'UTILISATEUR"));
  assert.ok(block.includes("la sélection de Florent"));
  assert.ok(block.includes("https://exemple.fr/tarifs"));
  assert.ok(block.indexOf("DÉBUT CONTEXTE") < block.indexOf("FIN CONTEXTE"));
});

test("contexte : les onglets ouverts sont listés (l'assistant voit tout ce qui est ouvert)", () => {
  const block = buildPageContextBlock({
    url: "https://a.fr",
    title: "A",
    openTabs: [
      { title: "Offre 1", url: "https://a.fr/offre1" },
      { title: "Offre 2", url: "https://b.fr/offre2" },
    ],
  });
  assert.ok(block.includes("TOUT CE QUE L'UTILISATEUR A OUVERT"));
  assert.ok(block.includes("2 onglets"));
  assert.ok(block.includes("https://a.fr/offre1"));
  assert.ok(block.includes("https://b.fr/offre2"));
});

test("contexte : sans onglets, aucune section « ouvert » parasite", () => {
  const block = buildPageContextBlock({ url: "https://a.fr", title: "A" });
  assert.ok(!block.includes("A OUVERT"));
});
