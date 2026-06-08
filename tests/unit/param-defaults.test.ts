import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyActionParamDefaults,
  seedActionParamDefaults,
} from "../../lib/connectors/param-defaults";

test("applyActionParamDefaults — range non résolu → A:Z (défaut sûr)", () => {
  const out = applyActionParamDefaults("google_sheets", "sheets.read", {
    spreadsheetId: "abc",
    range: "{{google_sheets_range}}",
  });
  assert.equal(out.range, "A:Z");
});

test("applyActionParamDefaults — ne remplace pas une plage explicite", () => {
  const out = applyActionParamDefaults("google_sheets", "sheets.read", {
    spreadsheetId: "abc",
    range: "Sheet1!A1:B2",
  });
  assert.equal(out.range, "Sheet1!A1:B2");
});

test("seedActionParamDefaults — sheets.read seed range = A:Z", () => {
  const seeded = seedActionParamDefaults("google_sheets", "sheets.read");
  assert.equal(seeded.range, "A:Z");
});
