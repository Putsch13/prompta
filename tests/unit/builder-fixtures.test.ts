import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateAgentManifest, hasBlockingIssues } from "../../lib/builder/validate-agent";
import { AgentManifestSchema } from "../../lib/agent/schema";
import { extractInputVariablesFromSteps } from "../../lib/builder/variables";

interface AgentFixture {
  id: string;
  expectValid: boolean;
  expectErrorCodes?: string[];
  manifest: unknown;
}

const FIXTURES_DIR = join(process.cwd(), "tests/fixtures/complex-agents");

function loadFixtures(): AgentFixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const raw = readFileSync(join(FIXTURES_DIR, name), "utf-8");
      return JSON.parse(raw) as AgentFixture;
    });
}

for (const fixture of loadFixtures()) {
  test(`fixture ${fixture.id} — validation attendue`, () => {
    const parsed = AgentManifestSchema.safeParse(fixture.manifest);
    assert.ok(parsed.success, `Manifeste ${fixture.id} invalide côté schema`);

    const inputKeys = extractInputVariablesFromSteps(parsed.data.steps);
    const issues = validateAgentManifest(parsed.data.steps, {
      connectors: parsed.data.connectors,
      inputKeys,
    });

    const blocking = hasBlockingIssues(issues);
    assert.equal(
      blocking,
      !fixture.expectValid,
      `${fixture.id}: attendu expectValid=${fixture.expectValid}, blocking=${blocking}, issues=${JSON.stringify(issues)}`,
    );

    if (fixture.expectErrorCodes?.length) {
      const codes = new Set(issues.filter((i) => i.severity === "error").map((i) => i.code));
      for (const expected of fixture.expectErrorCodes) {
        assert.ok(codes.has(expected), `${fixture.id}: code manquant ${expected}, got ${Array.from(codes).join(", ")}`);
      }
    }
  });
}
