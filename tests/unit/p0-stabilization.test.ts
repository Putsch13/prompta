import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAgentManifest, hasBlockingIssues } from "../../lib/builder/validate-agent";
import { validateActionParams } from "../../lib/connectors/action-requirements";
import { isSubscriptionAccessActive } from "@/lib/subscriptions/active";
import { missingRequiredScopes } from "../../lib/connectors/required-scopes";
import { sanitizeDeliverableFilename } from "../../lib/agent/deliverables";
import { buildExecutionKey } from "../../lib/agent/idempotency";
import type { AgentStep } from "../../lib/agent/schema";

test("validateActionParams — action sans params → warnings non bloquants", () => {
  const issues = validateActionParams("gmail", "gmail.send", {}, "Étape 1 (Action)");
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.severity === "warning"));
  assert.ok(issues.some((i) => i.code === "action_param_unmapped"));
});

test("validateActionParams — Gmail sans to → warning", () => {
  const issues = validateActionParams(
    "gmail",
    "gmail.send",
    { subject: "Hello", body: "World" },
    "Étape 1 (Action)",
  );
  assert.ok(issues.some((i) => i.code === "action_param_unmapped"));
  assert.match(issues.find((i) => i.key === "to")?.message ?? "", /to|Destinataire/i);
});

test("validateActionParams — Gmail avec bindings OK", () => {
  const issues = validateActionParams(
    "gmail",
    "gmail.send",
    {
      from: "{{resource:gmail.send_as}}",
      to: "{{email}}",
      subject: "{{subject}}",
      body: "{{body}}",
    },
    "Étape 1 (Action)",
  );
  assert.equal(issues.length, 0);
});

test("validateAgentManifest — Gmail params vides ne bloque plus", () => {
  const steps: AgentStep[] = [
    {
      type: "action",
      connector: "gmail",
      action: "gmail.send",
      params: {},
    },
  ];
  const issues = validateAgentManifest(steps, { connectors: ["gmail"] });
  assert.ok(!hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "action_param_unmapped"));
});

test("validateAgentManifest — Slack sans channel → warning seulement", () => {
  const steps: AgentStep[] = [
    {
      type: "action",
      connector: "slack",
      action: "slack.send",
      params: { text: "{{message}}" },
    },
  ];
  const issues = validateAgentManifest(steps, { connectors: ["slack"] });
  assert.ok(!hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "action_param_unmapped"));
});

test("validateAgentManifest — Sheets sans spreadsheetId → warning", () => {
  const steps: AgentStep[] = [
    {
      type: "action",
      connector: "google_sheets",
      action: "sheets.append",
      params: { range: "{{range}}", values: "{{values}}" },
    },
  ];
  const issues = validateAgentManifest(steps, { connectors: ["google_sheets"] });
  assert.ok(!hasBlockingIssues(issues));
});

test("isSubscriptionAccessActive — active reste actif", () => {
  assert.ok(
    isSubscriptionAccessActive({
      status: "active",
      cancel_at_period_end: false,
      current_period_end: null,
    }),
  );
});

test("isSubscriptionAccessActive — cancel_at_period_end garde accès jusqu'à fin période", () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  assert.ok(
    isSubscriptionAccessActive({
      status: "active",
      cancel_at_period_end: true,
      current_period_end: future,
    }),
  );
});

test("isSubscriptionAccessActive — canceled sans période future = inactif", () => {
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  assert.ok(
    !isSubscriptionAccessActive({
      status: "canceled",
      cancel_at_period_end: false,
      current_period_end: past,
    }),
  );
});

test("missingRequiredScopes — Gmail sans scope send", () => {
  const missing = missingRequiredScopes(
    ["https://www.googleapis.com/auth/gmail.readonly"],
    "gmail",
  );
  assert.ok(missing.length > 0);
});

test("missingRequiredScopes — Gmail avec scope send OK", () => {
  const missing = missingRequiredScopes(
    ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
    "gmail",
  );
  assert.equal(missing.length, 0);
});

test("sanitizeDeliverableFilename — nettoie les caractères dangereux", () => {
  assert.equal(sanitizeDeliverableFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeDeliverableFilename("rapport final (v2).md"), "rapport_final_v2_.md");
});

test("buildExecutionKey — diffère si params changent", () => {
  const a = buildExecutionKey("run-1", 2, "gmail.send", { to: "a@test.com" });
  const b = buildExecutionKey("run-1", 2, "gmail.send", { to: "b@test.com" });
  assert.notEqual(a, b);
});
