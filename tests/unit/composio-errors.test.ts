import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseComposioError } from "../../lib/composio/errors";

describe("parseComposioError", () => {
  it("detects missing connection", () => {
    const result = parseComposioError(new Error("No connected account found"), "GMAIL_SEND", "gmail");
    assert.equal(result.code, "connection_missing");
    assert.match(result.message, /Connectez gmail/i);
  });

  it("detects unknown action", () => {
    const result = parseComposioError(new Error("Tool not found"), "UNKNOWN_ACTION", "notion");
    assert.equal(result.code, "unknown_action");
  });
});
