import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyComposioSchemaDefaults,
  missingRequiredComposioParams,
  alignParamKeysToSchema,
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

test("guard — un enum requis multi-choix est TOUJOURS résolu (choix borné, jamais d'échec)", () => {
  const inputs = [
    input({ key: "design_type", required: true, enumValues: ["doc", "presentation", "whiteboard"] }),
  ];
  const args = applyComposioSchemaDefaults(inputs, {});
  assert.ok(["doc", "presentation", "whiteboard"].includes(args.design_type));
  assert.deepEqual(missingRequiredComposioParams(inputs, args), []);
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

test("guard — troncature au maxLength du schéma (titre aiFill > 255 chars)", () => {
  const inputs = [input({ key: "title", required: true, maxLength: 255 })];
  const long = "x".repeat(400);
  const args = applyComposioSchemaDefaults(inputs, { title: long });
  assert.ok(args.title.length <= 255, `longueur ${args.title.length}`);
  assert.ok(args.title.endsWith("…"));
});

test("guard — pas de troncature sous le maxLength", () => {
  const inputs = [input({ key: "title", maxLength: 255 })];
  const args = applyComposioSchemaDefaults(inputs, { title: "Titre court" });
  assert.equal(args.title, "Titre court");
});

import { pickEnumValue } from "../../lib/composio/param-guard";

test("guard — enum multi requis : choix contextuel au lieu d'un échec (design_type)", () => {
  const inputs = [
    input({ key: "design_type", required: true, enumValues: ["doc", "presentation", "whiteboard"] }),
    input({ key: "title", required: true }),
  ];
  const args = applyComposioSchemaDefaults(inputs, { title: "Présentation commerciale Q3" });
  assert.equal(args.design_type, "presentation");
  assert.deepEqual(missingRequiredComposioParams(inputs, args), []);
});

test("pickEnumValue — contexte FR matche la racine (présentation → presentation)", () => {
  assert.equal(pickEnumValue(["doc", "presentation", "whiteboard"], "une belle présentation canva"), "presentation");
  assert.equal(pickEnumValue(["doc", "presentation", "whiteboard"], "rédige un document"), "doc");
  // Aucun indice → première valeur (jamais d'échec).
  assert.equal(pickEnumValue(["RAW", "USER_ENTERED"], "xyz"), "RAW");
});

import { collectSchemaEnum } from "../../lib/composio/catalog";

test("collectSchemaEnum — enum plat, anyOf, const, items (schémas composés type Canva)", () => {
  assert.deepEqual(collectSchemaEnum({ enum: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(
    collectSchemaEnum({ anyOf: [{ enum: ["doc", "presentation", "whiteboard"] }, { type: "object" }] }),
    ["doc", "presentation", "whiteboard"],
  );
  assert.deepEqual(collectSchemaEnum({ oneOf: [{ const: "RAW" }, { const: "USER_ENTERED" }] }), ["RAW", "USER_ENTERED"]);
  // Schéma RÉEL de CANVA_POST_DESIGNS : l'enum vit sous properties.name,
  // properties.type est un const structurel ("preset") à ignorer.
  assert.deepEqual(
    collectSchemaEnum({
      anyOf: [
        {
          type: "object",
          properties: {
            name: { enum: ["doc", "whiteboard", "presentation"] },
            type: { const: "preset" },
          },
        },
        { type: "object", properties: { type: { const: "custom" }, width: {}, height: {} } },
      ],
    }),
    ["doc", "whiteboard", "presentation"],
  );
  assert.equal(collectSchemaEnum({ type: "string" }), undefined);
});

// ── Élagage des clés hors schéma ────────────────────────────────────────────
// Les plans LLM inventent des paramètres (« target », « options »…) que la
// validation Composio stricte rejette (« Extra inputs are not permitted »).
// alignParamKeysToSchema conserve les inconnues : c'est guardComposioParams
// qui les retire — testé ici sur la primitive d'alignement + le contrat.

test("alignParamKeysToSchema — les clés inconnues subsistent (l'élagage vit dans guardComposioParams)", () => {
  const inputs = [
    { key: "database_id", label: "Database Id", required: true, rawType: "string" },
    { key: "rows", label: "Rows", required: true, rawType: "array" },
  ] as never[];
  const aligned = alignParamKeysToSchema(inputs, {
    databaseId: "abc",       // aligné par tokens → database_id
    rows: "[]",
    target: "ma base",       // inventé par le LLM — hors schéma
  });
  assert.equal(aligned.database_id, "abc");
  assert.equal(aligned.target, "ma base"); // encore là : le garde l'élague ensuite
});
