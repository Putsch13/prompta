import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyComposioSchemaDefaults,
  missingRequiredComposioParams,
} from "../../lib/composio/param-guard";
import type { ComposioToolEntry } from "../../lib/composio/catalog";

type ToolInput = ComposioToolEntry["inputs"][number];

function input(partial: Partial<ToolInput> & { key: string }): ToolInput {
  return {
    label: partial.key,
    required: false,
    kind: "input",
    ...partial,
  } as ToolInput;
}

test("guard — le default du schéma remplit un champ requis absent (cas design_type)", () => {
  const inputs = [
    input({ key: "design_type", required: true, defaultValue: "presentation" }),
    input({ key: "title", required: true }),
  ];
  const args = applyComposioSchemaDefaults(inputs, { title: "Ma présentation" });
  assert.equal(args.design_type, "presentation");
  assert.deepEqual(missingRequiredComposioParams(inputs, args), []);
});

test("guard — un enum à choix unique est auto-rempli", () => {
  const inputs = [input({ key: "format", required: true, enumValues: ["pdf"] })];
  const args = applyComposioSchemaDefaults(inputs, {});
  assert.equal(args.format, "pdf");
});

test("guard — un enum à plusieurs choix n'est PAS deviné", () => {
  const inputs = [
    input({ key: "design_type", required: true, enumValues: ["doc", "presentation", "whiteboard"] }),
  ];
  const args = applyComposioSchemaDefaults(inputs, {});
  const missing = missingRequiredComposioParams(inputs, args);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].key, "design_type");
});

test("guard — champ requis vide (espaces) = manquant ; optionnel vide = ok", () => {
  const inputs = [
    input({ key: "name", required: true }),
    input({ key: "note", required: false }),
  ];
  const missing = missingRequiredComposioParams(inputs, { name: "   ", note: "" });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].key, "name");
});

test("guard — une valeur fournie n'est jamais écrasée par le default", () => {
  const inputs = [input({ key: "design_type", required: true, defaultValue: "presentation" })];
  const args = applyComposioSchemaDefaults(inputs, { design_type: "whiteboard" });
  assert.equal(args.design_type, "whiteboard");
});
