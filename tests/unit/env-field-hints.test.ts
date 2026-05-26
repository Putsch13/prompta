import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichEnvField } from "../../lib/builder/env-field-hints";

test("enrichEnvField — Google Sheets ID", () => {
  const f = enrichEnvField({
    key: "google_sheets_id",
    label: "Identifiant Google Sheets de la base",
    required: true,
  });
  assert.match(f.help, /ID de la feuille/i);
  assert.ok(f.placeholder.length > 10);
  assert.ok(f.hintDetail?.includes("/d/"));
});

test("enrichEnvField — nom expéditeur Gmail", () => {
  const f = enrichEnvField({
    key: "sender_name",
    label: "Nom d'expéditeur Gmail",
    required: true,
  });
  assert.match(f.help, /pas votre mot de passe/i);
  assert.match(f.hintTitle ?? "", /connexion Gmail/i);
});
