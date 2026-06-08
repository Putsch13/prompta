/**
 * Parseur générique des sorties de listing Composio.
 *
 * Composio renvoie des formes très variables selon le toolkit. Le picker doit
 * extraire le premier tableau d'objets {id, label}-like, quelle que soit la
 * profondeur ou le nom de clé.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseComposioResourceList } from "../../lib/connectors/list-resources";

test("Notion search: {results:[{id,title}]} → items", () => {
  const out = JSON.stringify({
    results: [
      { id: "page-1", title: "Roadmap" },
      { id: "page-2", title: "Notes" },
    ],
  });
  const items = parseComposioResourceList(out);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "page-1");
  assert.equal(items[0].label, "Roadmap");
});

test("Airtable: {bases:[{id,name}]} → items", () => {
  const out = JSON.stringify({ bases: [{ id: "app123", name: "CRM" }] });
  const items = parseComposioResourceList(out);
  assert.equal(items[0].id, "app123");
  assert.equal(items[0].label, "CRM");
});

test("Forme imbriquée {data:{tables:[…]}} → items", () => {
  const out = JSON.stringify({ data: { tables: [{ id: "tbl1", name: "Leads" }] } });
  const items = parseComposioResourceList(out);
  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Leads");
});

test("Forme {response_data:{items:[…]}} → items", () => {
  const out = JSON.stringify({ response_data: { items: [{ id: "x", name: "Y" }] } });
  const items = parseComposioResourceList(out);
  assert.equal(items[0].id, "x");
});

test("Slack channels {channels:[{id,name}]} → items", () => {
  const out = JSON.stringify({ channels: [{ id: "C1", name: "general" }] });
  const items = parseComposioResourceList(out);
  assert.equal(items[0].id, "C1");
  assert.equal(items[0].label, "general");
});

test("id numérique (ex. issue number) toléré", () => {
  const out = JSON.stringify({ issues: [{ number: 42, title: "Bug" }] });
  const items = parseComposioResourceList(out);
  assert.equal(items[0].id, "42");
  assert.equal(items[0].label, "Bug");
});

test("objet sans id → ignoré, on continue de chercher", () => {
  const out = JSON.stringify({
    meta: [{ foo: "bar" }],
    data: [{ id: "ok", name: "Trouvé" }],
  });
  const items = parseComposioResourceList(out);
  assert.equal(items[0].id, "ok");
});

test("label par défaut = id si aucun nom", () => {
  const out = JSON.stringify({ items: [{ id: "abc" }] });
  const items = parseComposioResourceList(out);
  assert.equal(items[0].label, "abc");
});

test("parent propagé sur les items", () => {
  const out = JSON.stringify({ tables: [{ id: "t1", name: "T" }] });
  const items = parseComposioResourceList(out, "base-1");
  assert.equal(items[0].parentId, "base-1");
});

test("JSON invalide → []", () => {
  assert.deepEqual(parseComposioResourceList("pas du json"), []);
});

test("aucun tableau d'objets id-like → []", () => {
  const out = JSON.stringify({ status: "ok", count: 0 });
  assert.deepEqual(parseComposioResourceList(out), []);
});
