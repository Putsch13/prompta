import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyActionParamDefaults,
  isAllRangeValue,
  PARAM_DEFAULT_ALL,
} from "../../lib/connectors/param-defaults";

test("isAllRangeValue — reconnaît les jokers « tout lire »", () => {
  assert.ok(isAllRangeValue(""));
  assert.ok(isAllRangeValue("*"));
  assert.ok(isAllRangeValue("all"));
  assert.ok(!isAllRangeValue("Sheet1!A1:D10"));
});

test("applyActionParamDefaults — range non résolu → *", () => {
  const out = applyActionParamDefaults("google_sheets", "sheets.read", {
    spreadsheetId: "abc",
    range: "{{google_sheets_range}}",
  });
  assert.equal(out.range, PARAM_DEFAULT_ALL);
});

test("applyActionParamDefaults — ne remplace pas une plage explicite", () => {
  const out = applyActionParamDefaults("google_sheets", "sheets.read", {
    spreadsheetId: "abc",
    range: "Sheet1!A1:B2",
  });
  assert.equal(out.range, "Sheet1!A1:B2");
});
