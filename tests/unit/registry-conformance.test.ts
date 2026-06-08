/**
 * Verrou CI (P4.2) : le registre connecteur doit être 100 % conforme.
 *
 * Empêche de merger un connecteur mal déclaré qui réintroduirait :
 *  - un input requis sans `kind` (UI ne sait pas quel widget afficher)
 *  - une ressource sans resourceType / listAction (picker vide)
 *  - un defaultValue magique non valide (« * »)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateRegistry } from "../../lib/connectors/registry-conformance";
import { CONNECTORS } from "../../lib/connectors/registry";
import { RESOURCE_TYPES } from "../../lib/connectors/resource-types";

test("registre connecteur 100 % conforme (kind requis, resourceType valide)", () => {
  const issues = validateRegistry();
  assert.deepEqual(
    issues,
    [],
    `Registre non conforme :\n${issues.map((i) => `  • [${i.code}] ${i.message}`).join("\n")}`,
  );
});

test("tous les RESOURCE_TYPES ont un listAction", () => {
  for (const [id, def] of Object.entries(RESOURCE_TYPES)) {
    assert.ok(
      def.listAction && def.listAction.length > 0,
      `ResourceType ${id} sans listAction`,
    );
  }
});

test("tous les connecteurs ont un label et au moins une action", () => {
  for (const c of CONNECTORS) {
    assert.ok(c.label, `Connecteur ${c.id} sans label`);
    assert.ok(c.actions.length > 0, `Connecteur ${c.id} sans action`);
    for (const a of c.actions) {
      assert.ok(a.id, `Action sans id dans ${c.id}`);
      assert.ok(a.label, `Action ${c.id}.${a.id} sans label`);
    }
  }
});
