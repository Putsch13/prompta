import { test } from "node:test";
import assert from "node:assert/strict";

import { pickToolSlug } from "../../lib/composio/resolve-native-action";
import type { ComposioToolEntry } from "../../lib/composio/catalog";

function tool(slug: string, name: string): ComposioToolEntry {
  return { slug, name, toolkit: "googlesheets", inputs: [] };
}

const SHEETS_TOOLS = [
  tool("GOOGLESHEETS_VALUES_GET", "Get values from Spreadsheet"),
  tool("GOOGLESHEETS_CREATE_GOOGLE_SHEET1", "Create Google Sheet"),
  tool("GOOGLESHEETS_DELETE_SHEET", "Delete Sheet"),
];

test("scoring — create_spreadsheet ne choisit JAMAIS un outil de lecture", () => {
  const slug = pickToolSlug(SHEETS_TOOLS, "googlesheets", "google_sheets.create_spreadsheet");
  assert.notEqual(slug, "GOOGLESHEETS_VALUES_GET");
  assert.equal(slug, "GOOGLESHEETS_CREATE_GOOGLE_SHEET1");
});

test("scoring — read_values ne choisit jamais un outil destructif", () => {
  const slug = pickToolSlug(SHEETS_TOOLS, "googlesheets", "google_sheets.read_values");
  assert.notEqual(slug, "GOOGLESHEETS_DELETE_SHEET");
});

import { composioMappingFor } from "../../lib/connectors/native-to-composio";

test("mapping — create_spreadsheet ne matche PAS « read » dans spREADsheet", () => {
  const m = composioMappingFor("google_sheets.create_spreadsheet");
  assert.notEqual(m?.toolSlug, "GOOGLESHEETS_VALUES_GET");
});

test("mapping — read_sheet matche toujours la lecture", () => {
  const m = composioMappingFor("google_sheets.read_sheet");
  assert.equal(m?.toolSlug, "GOOGLESHEETS_VALUES_GET");
});

test("scoring — le verbe exact (create) bat un synonyme plus court (add)", () => {
  const tools = [
    tool("GOOGLESHEETS_ADD_SHEET", "Add Sheet"),
    tool("GOOGLESHEETS_CREATE_GOOGLE_SHEET1", "Create Google Sheet"),
  ];
  const slug = pickToolSlug(tools, "googlesheets", "google_sheets.create_spreadsheet");
  assert.equal(slug, "GOOGLESHEETS_CREATE_GOOGLE_SHEET1");
});
