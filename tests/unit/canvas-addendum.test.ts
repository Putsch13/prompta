import { test } from "node:test";
import assert from "node:assert/strict";
import { isBinding, validateActionParams } from "../../lib/connectors/action-requirements";
import { validateAgentManifest, hasBlockingIssues } from "../../lib/builder/validate-agent";
import {
  normalizeGraph,
  planToGraph,
  graphHasRepairableIssues,
  type PlanGraph,
} from "../../lib/builder/plan-graph";
import type { GeneratedAgentPlan } from "../../lib/builder/generate-agent-plan";
import {
  assertNoLeakedCredentials,
  stripManifestForPublish,
  stripBuilderResources,
} from "../../lib/builder/validate-manifest-for-publish";
import type { AgentManifest } from "../../lib/agent/schema";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIN_MANIFEST = {
  tools: [] as string[],
  limits: {
    max_steps: 10,
    max_tokens: 8000,
    timeout_ms: 60000,
    max_tool_calls: 5,
    max_output_bytes: 51200,
  },
  outputs: ["result"],
};

test("normalizePlanVariableType — coerce types IA invalides", async () => {
  const {
    normalizePlanVariableType,
    normalizePlanTriggerType,
    parseGeneratedAgentPlan,
  } = await import("../../lib/builder/generate-agent-plan");
  assert.equal(normalizePlanVariableType("textarea"), "text");
  assert.equal(normalizePlanVariableType("string"), "text");
  assert.equal(normalizePlanVariableType("email"), "email");
  assert.equal(normalizePlanTriggerType("cron"), "schedule");
  assert.equal(normalizePlanTriggerType("form"), "manual");
  assert.equal(normalizePlanTriggerType("api"), "webhook");

  const plan = parseGeneratedAgentPlan({
    kind: "agent",
    title: "T",
    description: "D",
    objective: "O",
    variables: [
      { key: "a", label: "A", type: "textarea", required: true },
      { key: "b", label: "B", type: "string", required: true },
    ],
    triggers: [{ type: "manual" }, { type: "cron" }, { type: "form" }],
    steps: [
      {
        id: "s1",
        type: "llm",
        name: "S",
        description: "x",
        outputKey: "out",
      },
    ],
  });
  assert.equal(plan.variables[0].type, "text");
  assert.equal(plan.variables[1].type, "text");
  assert.deepEqual(plan.triggers.map((t) => t.type), ["manual", "schedule"]);
});

test("isBinding — détecte les bindings valides", () => {
  assert.ok(isBinding("{{destinataire_email}}"));
  assert.ok(isBinding("  {{step_analyze_output}}  "));
  assert.ok(isBinding("{{customer.email}}"));
  assert.ok(isBinding("{{resource:gmail.send_as}}"));
  assert.ok(!isBinding("equipe@test.com"));
  assert.ok(!isBinding(""));
});

test("validateActionParams — params vides → warnings, pas error bloquant", () => {
  const issues = validateActionParams("gmail", "gmail.send", {}, "Étape 1 (Action)");
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.severity === "warning"));
  assert.ok(issues.every((i) => i.code === "action_param_unmapped"));
});

test("validateActionParams — bindings complets → aucune issue", () => {
  const issues = validateActionParams("gmail", "gmail.send", {
    from: "{{resource:gmail.send_as}}",
    to: "{{email}}",
    subject: "{{subject}}",
    body: "{{body}}",
  }, "Étape 1");
  assert.equal(issues.length, 0);
});

test("validateAgentManifest — Gmail sans params ne bloque plus", () => {
  const steps = [
    {
      type: "action" as const,
      connector: "gmail",
      action: "gmail.send",
      params: {},
    },
  ];
  const issues = validateAgentManifest(steps, { connectors: ["gmail"] });
  assert.ok(!hasBlockingIssues(issues));
});

test("normalizeGraph — répare un nœud orphelin via dépendance outputKey", () => {
  const plan: GeneratedAgentPlan = {
    kind: "workflow",
    title: "Test",
    description: "",
    objective: "",
    variables: [],
    requiredConnectors: [],
    entryStepId: "send",
    steps: [
      {
        id: "send",
        type: "action",
        name: "Envoyer",
        description: "Envoie",
        outputKey: "send_result",
        connectorId: "gmail",
        actionSlug: "gmail.send",
        riskLevel: "high",
        requiresApproval: true,
        next: ["prepare"],
      },
      {
        id: "prepare",
        type: "llm",
        name: "Préparer",
        description: "Prépare à partir de {{analyze_output}}",
        outputKey: "prepare_output",
        riskLevel: "low",
        requiresApproval: false,
      },
      {
        id: "analyze",
        type: "llm",
        name: "Analyser",
        description: "Analyse",
        outputKey: "analyze_output",
        riskLevel: "low",
        requiresApproval: false,
      },
    ],
    triggers: [{ type: "manual" }],
    policies: { maxIterations: 1, requireHumanApprovalForExternalActions: true, memoryEnabled: false },
  };

  const broken = planToGraph(plan);
  assert.ok(graphHasRepairableIssues(broken));

  const fixed = normalizeGraph(broken);
  const analyzeToPrepare = fixed.edges.some(
    (e) => e.source === "analyze" && e.target === "prepare",
  );
  assert.ok(analyzeToPrepare || fixed.entryId === "analyze");
});

test("normalizeGraph — auto-bind params action requis", () => {
  const graph: PlanGraph = {
    entryId: "s1",
    nodes: [
      {
        id: "s1",
        kind: "action",
        name: "Send",
        connectorId: "gmail",
        actionSlug: "gmail.send",
        outputKey: "out",
        riskLevel: "high",
        requiresApproval: true,
      },
    ],
    edges: [],
  };
  const normalized = normalizeGraph(graph);
  const node = normalized.nodes[0];
  assert.ok(node.params?.to?.includes("{{"));
  assert.ok((normalized.meta?.variables?.length ?? 0) > 0);
});

test("normalizeGraph — préserve une valeur littérale fixée (pas d'écrasement)", () => {
  const graph: PlanGraph = {
    entryId: "s1",
    nodes: [
      {
        id: "s1",
        kind: "action",
        name: "Send",
        connectorId: "gmail",
        actionSlug: "gmail.send",
        outputKey: "out",
        riskLevel: "high",
        requiresApproval: true,
        params: { to: "ops@exemple.com" },
      },
    ],
    edges: [],
  };
  const normalized = normalizeGraph(graph);
  assert.equal(normalized.nodes[0].params?.to, "ops@exemple.com");
});

test("connectionMatchesConnector — google_drive ↔ googledrive", async () => {
  const { connectionMatchesConnector } = await import("../../lib/connectors/resolve-id");
  assert.ok(connectionMatchesConnector("googledrive", "google_drive"));
  assert.ok(connectionMatchesConnector("google_drive", "googledrive"));
});

test("actionVerb — extrait le verbe d'une action native", async () => {
  const { actionVerb } = await import("../../lib/composio/resolve-native-action");
  assert.equal(actionVerb("google_drive.list_files"), "list_files");
  assert.equal(actionVerb("gmail.send"), "send");
  assert.equal(actionVerb("list_files"), "list_files");
});

test("connectionMatchesConnector — robuste séparateurs/casse pour app arbitraire", async () => {
  const { connectionMatchesConnector } = await import("../../lib/connectors/resolve-id");
  // App non mappée explicitement : le filet générique doit matcher.
  assert.ok(connectionMatchesConnector("google_calendar", "googlecalendar"));
  assert.ok(connectionMatchesConnector("GoogleCalendar", "google_calendar"));
  assert.ok(connectionMatchesConnector("active_campaign", "activecampaign"));
  // Connecteurs distincts ne doivent pas matcher.
  assert.ok(!connectionMatchesConnector("gmail", "slack"));
});

test("assertNoLeakedCredentials — rejette clé OpenAI dans prompt", () => {
  const manifest: AgentManifest = {
    kind: "agent",
    inputs: [],
    secrets: ["openai"],
    connectors: [],
    ...MIN_MANIFEST,
    steps: [
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: "Utilise sk-1234567890abcdefghijklmnopqrst", // pragma: allowlist secret
      },
    ],
  };
  assert.throws(() => assertNoLeakedCredentials(manifest));
});

test("assertNoLeakedCredentials — rejette email en dur dans param requis", () => {
  const manifest: AgentManifest = {
    kind: "agent",
    inputs: [],
    secrets: [],
    connectors: ["gmail"],
    ...MIN_MANIFEST,
    steps: [
      {
        type: "action",
        connector: "gmail",
        action: "gmail.send",
        params: { to: "builder@test.com", subject: "{{s}}", body: "{{b}}" },
      },
    ],
  };
  assert.throws(() => assertNoLeakedCredentials(manifest));
});

test("stripBuilderResources — conserve étapes sharedEnv", () => {
  const manifest: AgentManifest = {
    kind: "agent",
    inputs: [],
    secrets: [],
    connectors: ["gmail"],
    ...MIN_MANIFEST,
    steps: [
      {
        type: "action",
        connector: "gmail",
        action: "gmail.send",
        sharedEnv: true,
        params: { to: "shared@test.com", subject: "Hi", body: "Body" },
      },
    ],
  };
  const stripped = stripBuilderResources(manifest);
  const step = stripped.steps[0];
  assert.equal(step.type, "action");
  if (step.type === "action") {
    assert.equal(step.params.to, "shared@test.com");
    assert.equal(step.sharedEnv, true);
  }
  assert.doesNotThrow(() => assertNoLeakedCredentials(manifest));
});

test("runnerRequiredConnectors — ignore sharedEnv pour abonné", async () => {
  const { runnerRequiredConnectors } = await import("../../lib/agent/run-connectors");
  const manifest: AgentManifest = {
    inputs: [],
    secrets: [],
    connectors: ["gmail", "slack"],
    ...MIN_MANIFEST,
    steps: [
      {
        type: "action",
        connector: "gmail",
        action: "gmail.send",
        sharedEnv: true,
        params: { to: "{{email}}", subject: "Hi", body: "Body" },
      },
      {
        type: "action",
        connector: "slack",
        action: "slack.post",
        params: { channel: "{{channel}}", text: "Hi" },
      },
    ],
  };
  const builder = runnerRequiredConnectors(manifest, { userId: "u1", creatorId: "u1" });
  assert.deepEqual(builder.sort(), ["gmail", "slack"]);
  const subscriber = runnerRequiredConnectors(manifest, { userId: "u2", creatorId: "u1" });
  assert.deepEqual(subscriber, ["slack"]);
});

test("orchestrator — résout connexions et clés depuis le runner courant", () => {
  const src = readFileSync(join(process.cwd(), "lib/agent/orchestrator.ts"), "utf-8");
  assert.ok(src.includes("getUserConnection(connUserId"));
  assert.ok(src.includes("sharedEnv"));
  assert.ok(src.includes("ctx.apiKeys[provider]"));
});

test("stripManifestForPublish — conserve bindings uniquement", () => {
  const manifest: AgentManifest = {
    kind: "workflow",
    inputs: [{ key: "email", label: "Email", type: "text", required: true }],
    secrets: ["openai"],
    connectors: ["gmail"],
    ...MIN_MANIFEST,
    steps: [
      {
        type: "action",
        connector: "gmail",
        action: "gmail.send",
        params: { to: "{{email}}", subject: "Hello", body: "{{body}}" },
      },
    ],
  };
  const stripped = stripManifestForPublish(manifest);
  assert.equal(stripped.steps[0].type === "action" && stripped.steps[0].params.to, "{{email}}");
  assert.equal(stripped.steps[0].type === "action" && stripped.steps[0].params.subject, "{{subject}}");
});
