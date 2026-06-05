import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentManifest } from "../../lib/agent/schema";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const baseManifest = (steps: AgentManifest["steps"]): AgentManifest => ({
  inputs: [{ key: "nom", label: "Nom", type: "text", required: true }],
  steps,
  connectors: [],
  secrets: [],
  tools: [],
  outputs: ["result"],
  limits: {
    max_steps: 20,
    max_tokens: 50000,
    max_tool_calls: 10,
    max_output_bytes: 512000,
    timeout_ms: 30000,
  },
});

test("integration — étapes parallèles en mode démo", async () => {
  const { runAgent } = await import("../../lib/agent/orchestrator");
  const manifest = baseManifest([
    { type: "llm", model: "gpt-5.4", prompt: "Bonjour {{nom}}", outputKey: "greeting" },
    {
      type: "parallel",
      outputKey: "parallel_result",
      branches: [
        {
          steps: [{ type: "llm", model: "gpt-5.4", prompt: "Branche A pour {{nom}}", outputKey: "branch_a" }],
          outputKey: "branch_a",
        },
        {
          steps: [{ type: "llm", model: "gpt-5.4", prompt: "Branche B pour {{nom}}", outputKey: "branch_b" }],
          outputKey: "branch_b",
        },
      ],
    },
    { type: "llm", model: "gpt-5.4", prompt: "Synthèse : {{parallel_result}}", outputKey: "final" },
  ]);

  const result = await runAgent(manifest, {
    userId: "00000000-0000-0000-0000-000000000001",
    listingId: "preview",
    inputs: { nom: "Alice" },
    apiKeys: {},
    dryRun: true,
    demoMode: true,
  });

  assert.equal(result.status, "completed", result.error ?? JSON.stringify(result));
  assert.ok(result.stepsCompleted >= 3);
  assert.ok(result.output.greeting);
  assert.ok(result.output.parallel_result);
});

test("integration — reprise run depuis resumeFromStep", async () => {
  const { runAgent } = await import("../../lib/agent/orchestrator");
  const manifest = baseManifest([
    { type: "llm", model: "gpt-5.4", prompt: "Étape 1 : {{nom}}", outputKey: "step_0_output" },
    { type: "llm", model: "gpt-5.4", prompt: "Étape 2 avec {{step_0_output}}", outputKey: "step_1_output" },
    { type: "llm", model: "gpt-5.4", prompt: "Étape 3 finale", outputKey: "step_2_output" },
  ]);

  const partialOutputs = {
    step_0_output: "[DÉMO] étape 0 faite",
    step_0: "[DÉMO] étape 0 faite",
  };

  const result = await runAgent(manifest, {
    userId: "00000000-0000-0000-0000-000000000001",
    listingId: "preview",
    inputs: { nom: "Bob" },
    apiKeys: {},
    dryRun: true,
    demoMode: true,
    resumeFromStep: 2,
    resumeOutputs: partialOutputs,
  });

  assert.equal(result.status, "completed", result.error ?? JSON.stringify(result));
  assert.equal(result.stepsCompleted, 3);
  assert.ok(result.output.step_2_output);
  assert.equal(result.output.step_0_output, partialOutputs.step_0_output);
});

test("integration — variables imbriquées customer.email via JSON input", async () => {
  const { runAgent } = await import("../../lib/agent/orchestrator");
  const manifest = baseManifest([
    {
      type: "llm",
      model: "gpt-5.4",
      prompt: "Contact : {{customer.email}} — nom {{customer.name}}",
      outputKey: "contact_line",
    },
  ]);

  const customerJson = JSON.stringify({ email: "alice@example.com", name: "Alice" });
  const result = await runAgent(manifest, {
    userId: "00000000-0000-0000-0000-000000000001",
    listingId: "preview",
    inputs: { customer: customerJson },
    apiKeys: {},
    dryRun: true,
    demoMode: true,
  });

  assert.equal(result.status, "completed", result.error ?? JSON.stringify(result));
  assert.match(result.output.contact_line ?? "", /alice@example.com/);
});
