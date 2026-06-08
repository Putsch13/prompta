/**
 * Découverte d'action de listing + types de ressources synthétiques.
 *
 * Le picker doit fonctionner pour n'importe quel toolkit Composio : tout `*_id`
 * devient une ressource listable, et on choisit dynamiquement le meilleur tool
 * « lister / rechercher » du toolkit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { pickListTool, scoreListTool, resourceNoun } from "../../lib/composio/discover-list-action";
import {
  composioResourceType,
  getResourceType,
  looksLikeResourceKey,
} from "../../lib/connectors/resource-types";
import type { ComposioToolEntry } from "../../lib/composio/catalog";

function tool(slug: string, required: string[] = []): ComposioToolEntry {
  return {
    slug,
    name: slug,
    toolkit: "demo",
    inputs: required.map((k) => ({
      key: k,
      label: k,
      required: true,
      kind: "input" as const,
    })),
  };
}

// ─── resourceNoun ─────────────────────────────────────────────────────────────

test("resourceNoun: retire le suffixe _id/_ids", () => {
  assert.equal(resourceNoun("database_id"), "database");
  assert.equal(resourceNoun("spreadsheet_ids"), "spreadsheet");
  assert.equal(resourceNoun("base_id"), "base");
});

// ─── looksLikeResourceKey ─────────────────────────────────────────────────────

test("looksLikeResourceKey: *_id / *_ids = ressource", () => {
  assert.ok(looksLikeResourceKey("database_id"));
  assert.ok(looksLikeResourceKey("table_ids"));
});

test("looksLikeResourceKey: id nu et faux positifs exclus", () => {
  assert.ok(!looksLikeResourceKey("id"));
  assert.ok(!looksLikeResourceKey("android"));
  assert.ok(!looksLikeResourceKey("valid"));
  assert.ok(!looksLikeResourceKey("title"));
});

// ─── getResourceType synthétique ──────────────────────────────────────────────

test("getResourceType: type synthétique composio:<toolkit>:<key>", () => {
  const def = getResourceType(composioResourceType("github", "repository_id"));
  assert.ok(def);
  assert.equal(def?.connectorId, "github");
  assert.equal(def?.listVia, "composio");
});

test("getResourceType: composio: malformé → undefined", () => {
  assert.equal(getResourceType("composio:"), undefined);
  assert.equal(getResourceType("composio:github"), undefined);
});

test("getResourceType: type curaté natif inchangé", () => {
  assert.equal(getResourceType("slack.channel")?.connectorId, "slack");
});

// ─── scoreListTool ────────────────────────────────────────────────────────────

test("scoreListTool: LIST + nom de ressource > action unitaire", () => {
  const list = scoreListTool(tool("GITHUB_LIST_REPOSITORIES"), "repository");
  const get = scoreListTool(tool("GITHUB_GET_REPOSITORY", ["owner", "repo"]), "repository");
  assert.ok(list > get);
});

test("scoreListTool: mutation fortement pénalisée", () => {
  const create = scoreListTool(tool("NOTION_CREATE_DATABASE"), "database");
  assert.ok(create < 0);
});

// ─── pickListTool ─────────────────────────────────────────────────────────────

test("pickListTool: choisit l'action de listing du toolkit", () => {
  const tools = [
    tool("AIRTABLE_CREATE_BASE"),
    tool("AIRTABLE_LIST_BASES"),
    tool("AIRTABLE_GET_BASE", ["base_id"]),
  ];
  const chosen = pickListTool(tools, "base_id");
  assert.equal(chosen?.slug, "AIRTABLE_LIST_BASES");
});

test("pickListTool: SEARCH générique accepté faute de mieux", () => {
  const tools = [tool("NOTION_SEARCH_NOTION_PAGE"), tool("NOTION_CREATE_PAGE")];
  const chosen = pickListTool(tools, "page_id");
  assert.equal(chosen?.slug, "NOTION_SEARCH_NOTION_PAGE");
});

test("pickListTool: aucun candidat crédible → undefined", () => {
  const tools = [tool("STRIPE_CREATE_CHARGE", ["amount"]), tool("STRIPE_REFUND_CHARGE", ["id"])];
  assert.equal(pickListTool(tools, "customer_id"), undefined);
});
