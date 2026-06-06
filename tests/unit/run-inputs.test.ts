import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentManifest } from "../../lib/agent/schema";
import { deriveRunInputsFromSteps } from "../../lib/builder/run-inputs";
import { buildManifest } from "../../lib/builder/manifest";
import { enrichEnvField } from "../../lib/builder/env-field-hints";

test("deriveRunInputsFromSteps — sheet épinglé + plage par défaut → aucun champ plage", () => {
  const steps: AgentManifest["steps"] = [
    {
      type: "action",
      connector: "google_sheets",
      action: "sheets.read",
      params: {
        spreadsheetId: "1abc-pinned-id",
        range: "*",
      },
      paramMeta: {
        spreadsheetId: { scope: "builder_test" },
        range: { scope: "builder_test" },
      },
    },
  ];

  assert.equal(deriveRunInputsFromSteps(steps).length, 0);
});

test("deriveRunInputsFromSteps — sheet épinglé + plage binding → pas de champ (défaut runtime)", () => {
  const steps: AgentManifest["steps"] = [
    {
      type: "action",
      connector: "google_sheets",
      action: "sheets.read",
      params: {
        spreadsheetId: "1abc-pinned-id",
        range: "{{google_sheets_range}}",
      },
      paramMeta: {
        spreadsheetId: { scope: "builder_test" },
      },
    },
  ];

  const fields = deriveRunInputsFromSteps(steps);
  assert.equal(fields.length, 0);
});

test("deriveRunInputsFromSteps — plage optionnelle au client", () => {
  const steps: AgentManifest["steps"] = [
    {
      type: "action",
      connector: "google_sheets",
      action: "sheets.read",
      params: {
        spreadsheetId: "1abc-pinned-id",
        range: "{{google_sheets_range}}",
      },
      paramMeta: {
        spreadsheetId: { scope: "builder_test" },
        range: { scope: "end_user" },
      },
    },
  ];

  const fields = deriveRunInputsFromSteps(steps);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].key, "google_sheets_range");
  assert.equal(fields[0].required, false);
});

test("deriveRunInputsFromSteps — sheet + plage épinglés → aucun champ", () => {
  const steps: AgentManifest["steps"] = [
    {
      type: "action",
      connector: "google_sheets",
      action: "sheets.read",
      params: {
        spreadsheetId: "1abc-pinned-id",
        range: "Sheet1!A1:D10",
      },
      paramMeta: {
        spreadsheetId: { scope: "builder_test" },
        range: { scope: "builder_test" },
      },
    },
  ];

  assert.equal(deriveRunInputsFromSteps(steps).length, 0);
});

test("deriveRunInputsFromSteps — sortie d'étape jamais demandée", () => {
  const steps: AgentManifest["steps"] = [
    { type: "llm", model: "gpt-5.4", prompt: "Analyse {{email_recu}}", outputKey: "analysis" },
    {
      type: "action",
      connector: "gmail",
      action: "gmail.send",
      params: {
        from: "{{resource:gmail.send_as}}",
        to: "{{destinataire}}",
        subject: "Re:",
        body: "{{analysis}}",
      },
    },
  ];

  const fields = deriveRunInputsFromSteps(steps);
  const keys = fields.map((f) => f.key);
  assert.ok(keys.includes("email_recu"));
  assert.ok(keys.includes("destinataire"));
  assert.ok(!keys.includes("analysis"));
});

test("buildManifest — inputs dérivés des steps, pas des envFields parallèles", () => {
  const steps: AgentManifest["steps"] = [
    {
      type: "action",
      connector: "google_sheets",
      action: "sheets.read",
      params: {
        spreadsheetId: "pinned-id",
        range: "*",
      },
      paramMeta: {
        spreadsheetId: { scope: "builder_test" },
        range: { scope: "builder_test" },
      },
    },
  ];

  const manifest = buildManifest({
    type: "agent",
    promptBody: "",
    steps,
    envFields: [
      { key: "wrong_duplicate", label: "ID feuille", required: true },
    ],
    requiredSecrets: [],
  });

  assert.deepEqual(manifest.inputs.map((i) => i.key), []);
});

test("enrichEnvField — plage ≠ aide ID Sheets", () => {
  const f = enrichEnvField({
    key: "google_sheets_range",
    label: "Plage (ex: Sheet1!A1:D10)",
    paramKey: "range",
    required: true,
  });
  assert.match(f.help, /classeur/i);
  assert.equal(f.placeholder, "Sheet1!A1:D10");
  assert.doesNotMatch(f.help, /ID de la feuille/i);
});
