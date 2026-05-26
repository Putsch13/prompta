import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createSignedState, verifySignedState } from "../../lib/connectors/oauth-state";

describe("oauth-state", () => {
  before(() => {
    process.env.OAUTH_STATE_SECRET = "test-secret-for-unit-tests-only";
  });

  it("creates and verifies signed state", () => {
    const state = createSignedState({ userId: "user-1", connectorId: "gmail" });
    const parsed = verifySignedState(state);
    assert.ok(parsed);
    assert.equal(parsed?.userId, "user-1");
    assert.equal(parsed?.connectorId, "gmail");
  });

  it("rejects tampered state", () => {
    const state = createSignedState({ userId: "user-1", connectorId: "gmail" });
    const tampered = state.slice(0, -4) + "xxxx";
    assert.equal(verifySignedState(tampered), null);
  });
});
