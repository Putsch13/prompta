/**
 * Mapping natif → Composio (fix 401).
 *
 * Vérifie que les actions du registry sont traduites vers les bons slugs/args
 * Composio (vérifiés sur la doc), sans laisser passer de placeholder.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { NATIVE_TO_COMPOSIO, composioMappingFor } from "../../lib/connectors/native-to-composio";
import { resourcePlaceholder } from "../../lib/connectors/param-bindings";

test("sheets.read → GOOGLESHEETS_VALUES_GET avec spreadsheet_id + range", () => {
  const m = composioMappingFor("sheets.read");
  assert.ok(m);
  assert.equal(m!.toolSlug, "GOOGLESHEETS_VALUES_GET");
  assert.equal(m!.toolkitSlug, "googlesheets");
  const args = m!.mapParams({ spreadsheetId: "1AbC", range: "Sheet1!A1:C10" });
  assert.deepEqual(args, { spreadsheet_id: "1AbC", range: "Sheet1!A1:C10" });
});

test("sheets.read : onglet + range combinés, défaut A:Z", () => {
  const m = composioMappingFor("sheets.read")!;
  assert.equal(m.mapParams({ spreadsheetId: "x", tab: "Feuille 2", range: "A1:B2" }).range, "Feuille 2!A1:B2");
  assert.equal(m.mapParams({ spreadsheetId: "x", range: "" }).range, "A:Z");
});

test("sheets.read : placeholder non résolu est retiré (pas de {{…}})", () => {
  const m = composioMappingFor("sheets.read")!;
  const args = m.mapParams({ spreadsheetId: resourcePlaceholder("google_sheets.spreadsheet"), range: "A:Z" });
  assert.ok(!("spreadsheet_id" in args), "le placeholder ne doit pas être envoyé");
  assert.equal(args.range, "A:Z");
});

test("gmail.send → GMAIL_SEND_EMAIL avec recipient_email", () => {
  const m = composioMappingFor("gmail.send")!;
  assert.equal(m.toolSlug, "GMAIL_SEND_EMAIL");
  const args = m.mapParams({ to: "alice@x.com", subject: "Hi", body: "Hello", from: "{{from}}" });
  assert.deepEqual(args, { recipient_email: "alice@x.com", subject: "Hi", body: "Hello" });
});

test("slack.send → SLACK_SEND_MESSAGE avec channel + text", () => {
  const m = composioMappingFor("slack.send")!;
  assert.equal(m.toolSlug, "SLACK_SEND_MESSAGE");
  assert.deepEqual(m.mapParams({ channel: "C123", text: "yo" }), { channel: "C123", text: "yo" });
});

test("sheets.append → GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND", () => {
  const m = composioMappingFor("sheets.append")!;
  assert.equal(m.toolSlug, "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND");
  const args = m.mapParams({ spreadsheetId: "x", range: "A:Z", values: "[[\"a\",\"b\"]]" });
  assert.equal(args.spreadsheet_id, "x");
  assert.equal(args.values, "[[\"a\",\"b\"]]");
});

test("tous les mappings ont un slug UPPER_SNAKE et un toolkit", () => {
  for (const [actionId, m] of Object.entries(NATIVE_TO_COMPOSIO)) {
    assert.match(m.toolSlug, /^[A-Z][A-Z0-9_]+$/, `${actionId} slug invalide`);
    assert.ok(m.toolkitSlug.length > 0, `${actionId} toolkit manquant`);
  }
});
