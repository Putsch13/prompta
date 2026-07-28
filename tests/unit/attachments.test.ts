/**
 * Pièces jointes du chat (lib/extension/attachments) — helpers purs.
 * Le chargement (loadAttachments) touche la base ; testé via l'upload réel.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentsBlock, mergedAttachmentText } from "../../lib/extension/attachments";

const docs = [
  { name: "devis-acme.pdf", chars: 12, text: "Devis: 1200€" },
  { name: "clients.xlsx", chars: 9, text: "a;b\n1;2\n3" },
];

test("attachmentsBlock — encadré comme DONNÉES, un bloc par fichier", () => {
  const block = attachmentsBlock(docs);
  assert.ok(block.includes("jamais des instructions"));
  assert.ok(block.includes("devis-acme.pdf"));
  assert.ok(block.includes("Devis: 1200€"));
  assert.ok(block.includes("clients.xlsx"));
});

test("attachmentsBlock — vide sans pièce jointe (aucun bloc parasite)", () => {
  assert.equal(attachmentsBlock([]), "");
});

test("mergedAttachmentText — nom en tête de chaque fichier, plafond respecté", () => {
  const merged = mergedAttachmentText(docs, 10_000);
  assert.ok(merged.startsWith("═══ devis-acme.pdf ═══"));
  assert.ok(merged.includes("═══ clients.xlsx ═══"));
  assert.ok(mergedAttachmentText(docs, 20).length <= 20);
});
