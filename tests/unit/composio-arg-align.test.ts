/**
 * Alignement générique des noms de paramètres sur le schéma d'un outil Composio.
 * Couvre la classe de bug « camelCase vs snake_case » sur les 300+ toolkits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { alignArgKeysToSchema } from "../../lib/composio/catalog";

test("camelCase → snake_case du schéma", () => {
  const out = alignArgKeysToSchema(
    { spreadsheetId: "1AbC", rangeA1: "A:Z" },
    ["spreadsheet_id", "range_a1", "value_input_option"],
  );
  assert.equal(out.spreadsheet_id, "1AbC");
  assert.equal(out.range_a1, "A:Z");
  assert.ok(!("spreadsheetId" in out));
});

test("clé déjà conforme inchangée", () => {
  const out = alignArgKeysToSchema({ channel: "C1", text: "yo" }, ["channel", "text"]);
  assert.deepEqual(out, { channel: "C1", text: "yo" });
});

test("clé sans correspondance laissée telle quelle (best-effort, non destructif)", () => {
  const out = alignArgKeysToSchema({ mystery: "x" }, ["channel", "text"]);
  assert.equal(out.mystery, "x");
});

test("schéma vide → params inchangés", () => {
  const params = { a: "1", b: "2" };
  assert.deepEqual(alignArgKeysToSchema(params, []), params);
});

test("séparateurs/casse ignorés (recipientEmail → recipient_email)", () => {
  const out = alignArgKeysToSchema({ recipientEmail: "a@b.com" }, ["recipient_email", "subject"]);
  assert.equal(out.recipient_email, "a@b.com");
});

// ─── alignement générique des clés (ensemble de tokens) ─────────────────────
import { alignParamKeysToSchema } from "@/lib/composio/param-guard";

test("alignParamKeysToSchema : board_id ≡ idBoard, spreadsheet_id ≡ spreadsheetId", () => {
  const inputs = [
    { key: "idBoard", label: "Id Board", required: true, type: "text", kind: "input", defaultScope: "dynamic" },
    { key: "name", label: "Name", required: true, type: "text", kind: "input", defaultScope: "dynamic" },
  ] as Parameters<typeof alignParamKeysToSchema>[0];
  const out = alignParamKeysToSchema(inputs, { board_id: "abc123", name: "À faire" });
  assert.equal(out.idBoard, "abc123");
  assert.equal(out.board_id, undefined);
  assert.equal(out.name, "À faire");

  const inputs2 = [
    { key: "spreadsheetId", label: "Spreadsheet", required: true, type: "text", kind: "input", defaultScope: "dynamic" },
  ] as Parameters<typeof alignParamKeysToSchema>[0];
  const out2 = alignParamKeysToSchema(inputs2, { spreadsheet_id: "1XYZ" });
  assert.equal(out2.spreadsheetId, "1XYZ");
});

test("alignParamKeysToSchema : ne touche pas une clé déjà exacte ni n'écrase une valeur", () => {
  const inputs = [
    { key: "idBoard", label: "Id Board", required: true, type: "text", kind: "input", defaultScope: "dynamic" },
  ] as Parameters<typeof alignParamKeysToSchema>[0];
  const out = alignParamKeysToSchema(inputs, { idBoard: "keep", board_id: "ignore" });
  assert.equal(out.idBoard, "keep");
});
