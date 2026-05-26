import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition } from "../../lib/agent/condition";

describe("evaluateCondition", () => {
  it("evaluates numeric comparison", () => {
    assert.equal(evaluateCondition("{{score}} > 80", { score: "90" }), true);
    assert.equal(evaluateCondition("{{score}} > 80", { score: "50" }), false);
  });

  it("evaluates equality", () => {
    assert.equal(evaluateCondition('{{status}} == "hot"', { status: "hot" }), true);
  });

  it("evaluates json path", () => {
    const vars = { extract_leads: JSON.stringify({ count: 5 }) };
    assert.equal(evaluateCondition("{{extract_leads.count}} >= 5", vars), true);
  });
});
