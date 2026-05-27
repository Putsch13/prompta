import { test } from "node:test";
import assert from "node:assert/strict";
import { extractInputVariables, isFakeVariable, validateAgentSteps, extractInputVariablesFromSteps } from "../../lib/builder/variables";
import { validateAgentManifest, hasBlockingIssues } from "../../lib/builder/validate-agent";
import type { AgentStep } from "../../lib/agent/schema";

// ──────────────────────────────────────────────────────────────
// extractInputVariables
// ──────────────────────────────────────────────────────────────

test("extractInputVariables — variables simples", () => {
  const vars = extractInputVariables("Bonjour {{nom}}, voici {{sujet}} pour vous.");
  assert.deepEqual(vars, ["nom", "sujet"]);
});

test("extractInputVariables — ignore les fausses variables", () => {
  const vars = extractInputVariables("{{variable}} et {{input}} et {{step_N_output}}");
  assert.equal(vars.length, 0);
});

test("extractInputVariables — ignore les step_X_output", () => {
  const vars = extractInputVariables("Résultat : {{step_0_output}} et {{step_3_output}}");
  assert.equal(vars.length, 0);
});

test("extractInputVariables — déduplique", () => {
  const vars = extractInputVariables("{{nom}} {{nom}} {{nom}}");
  assert.deepEqual(vars, ["nom"]);
});

test("extractInputVariables — variables imbriquées customer.email", () => {
  const vars = extractInputVariables("Email : {{customer.email}}, nom {{customer.name}}");
  assert.deepEqual(vars.sort(), ["customer.email", "customer.name"]);
});

test("extractInputVariables — ignore step_0_output.data.path", () => {
  const vars = extractInputVariables("Ref {{step_0_output.data.name}}");
  assert.equal(vars.length, 0);
});

test("isFakeVariable — reconnaît les fausses vars", () => {
  assert.ok(isFakeVariable("variable"));
  assert.ok(isFakeVariable("input"));
  assert.ok(isFakeVariable("step_N_output"));
  assert.ok(isFakeVariable("step_0_output"));
  assert.ok(isFakeVariable("step_12_output"));
  assert.ok(!isFakeVariable("nom"));
  assert.ok(!isFakeVariable("email"));
});

// ──────────────────────────────────────────────────────────────
// validateAgentSteps (legacy)
// ──────────────────────────────────────────────────────────────

test("validateAgentSteps — prompt vide détecté", () => {
  const issues = validateAgentSteps([{ type: "llm", prompt: "" }]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /prompt.*vide/i);
});

test("validateAgentSteps — référence future bloquée", () => {
  const issues = validateAgentSteps([
    { type: "llm", prompt: "Utilise {{step_5_output}} pour résumer." },
  ]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /référence invalide/i);
});

test("validateAgentSteps — référence valide ok", () => {
  const issues = validateAgentSteps([
    { type: "llm", prompt: "Étape 1" },
    { type: "llm", prompt: "Résumé de {{step_0_output}}" },
  ]);
  assert.equal(issues.length, 0);
});

// ──────────────────────────────────────────────────────────────
// validateAgentManifest (nouveau validateur complet)
// ──────────────────────────────────────────────────────────────

test("validateAgentManifest — prompt vide", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-4o", prompt: "  " },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "empty_prompt"));
});

test("validateAgentManifest — code vide", () => {
  const steps: AgentStep[] = [
    { type: "code", language: "python", source: "" },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "empty_code"));
});

test("validateAgentManifest — retrieve sans query", () => {
  const steps: AgentStep[] = [
    { type: "retrieve", source: "url", query: "", maxResults: 5 },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "empty_retrieve_query"));
});

test("validateAgentManifest — action sans connecteur", () => {
  const steps: AgentStep[] = [
    { type: "action", connector: "", action: "GMAIL_SEND_EMAIL", params: {} },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "action_no_connector"));
});

test("validateAgentManifest — action sans action", () => {
  const steps: AgentStep[] = [
    { type: "action", connector: "gmail", action: "", params: {} },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "action_no_action"));
});

test("validateAgentManifest — référence future bloquée", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-4o", prompt: "Utilise {{step_3_output}} pour résumer." },
    { type: "llm", model: "gpt-4o", prompt: "Suite" },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "future_step_reference"));
});

test("validateAgentManifest — référence à soi-même bloquée", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-4o", prompt: "Utilise {{step_0_output}} dans mon prompt." },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "future_step_reference"));
});

test("validateAgentManifest — référence step_0_output.score autorisée à l'étape 1", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-4o", prompt: "Analyse initiale" },
    { type: "llm", model: "gpt-4o", prompt: "Score : {{step_0_output.score}}" },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(!hasBlockingIssues(issues));
});

test("validateAgentManifest — outputKey dupliqué", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-4o", prompt: "A", outputKey: "result" },
    { type: "llm", model: "gpt-4o", prompt: "B", outputKey: "result" },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "duplicate_output_key"));
});

test("validateAgentManifest — agent valide multi-étapes", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-4o", prompt: "Analyse {{topic}}", outputKey: "analysis" },
    { type: "action", connector: "gmail", action: "GMAIL_SEND_EMAIL", params: { body: "{{step_0_output}}" }, outputKey: "sent" },
    { type: "llm", model: "gpt-4o", prompt: "Résumé final de {{step_0_output}} et {{step_1_output}}", outputKey: "summary" },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(!hasBlockingIssues(issues));
});

test("validateAgentManifest — connecteur non listé en warning", () => {
  const steps: AgentStep[] = [
    { type: "action", connector: "slack", action: "SLACK_SEND_MESSAGE", params: {} },
  ];
  const issues = validateAgentManifest(steps, { connectors: ["gmail"] });
  assert.ok(!hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "unlisted_connector" && i.severity === "warning"));
});

// ──────────────────────────────────────────────────────────────
// Étapes parallèles
// ──────────────────────────────────────────────────────────────

test("validateAgentManifest — parallel valide", () => {
  const steps: AgentStep[] = [
    { type: "llm", model: "gpt-4o", prompt: "Analyse {{topic}}", outputKey: "analysis" },
    {
      type: "parallel",
      branches: [
        {
          steps: [{ type: "llm", model: "gpt-4o", prompt: "Résumé court" }],
          outputKey: "short_summary",
        },
        {
          steps: [{ type: "llm", model: "gpt-4o", prompt: "Résumé long" }],
          outputKey: "long_summary",
        },
      ],
      outputKey: "parallel_result",
    },
    { type: "llm", model: "gpt-4o", prompt: "Combiner {{step_1_output}}" },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(!hasBlockingIssues(issues));
});

test("validateAgentManifest — parallel avec branche vide → erreur", () => {
  const steps: AgentStep[] = [
    {
      type: "parallel",
      branches: [
        { steps: [{ type: "llm", model: "gpt-4o", prompt: "OK" }] },
        { steps: [] },
      ],
    },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "parallel_empty_branch"));
});

test("validateAgentManifest — parallel avec outputKey dupliqué entre branches → erreur", () => {
  const steps: AgentStep[] = [
    {
      type: "parallel",
      branches: [
        { steps: [{ type: "llm", model: "gpt-4o", prompt: "A" }], outputKey: "dup" },
        { steps: [{ type: "llm", model: "gpt-4o", prompt: "B" }], outputKey: "dup" },
      ],
    },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(hasBlockingIssues(issues));
  assert.ok(issues.some((i) => i.code === "parallel_duplicate_branch_output_key"));
});

test("validateAgentManifest — parallel valide sous-étapes récursives", () => {
  const steps: AgentStep[] = [
    {
      type: "parallel",
      branches: [
        {
          steps: [
            { type: "tool", tool: "web_search", params: { query: "{{topic}}" } },
            { type: "llm", model: "gpt-4o", prompt: "Résumé de {{step_0_output}}" },
          ],
          outputKey: "branch_a",
        },
        {
          steps: [{ type: "code", language: "python", source: "print('hello')" }],
          outputKey: "branch_b",
        },
      ],
    },
  ];
  const issues = validateAgentManifest(steps);
  assert.ok(!hasBlockingIssues(issues));
});

// ──────────────────────────────────────────────────────────────
// extractInputVariablesFromSteps avec parallel
// ──────────────────────────────────────────────────────────────

test("extractInputVariablesFromSteps — extrait vars depuis branches parallèles", () => {
  const steps = [
    { type: "llm", prompt: "Bonjour {{nom}}" },
    {
      type: "parallel",
      branches: [
        { steps: [{ type: "llm", prompt: "Branche avec {{email}}" }] },
        { steps: [{ type: "llm", prompt: "Branche avec {{sujet}}" }] },
      ],
    },
  ];
  const vars = extractInputVariablesFromSteps(steps as any);
  assert.ok(vars.includes("nom"));
  assert.ok(vars.includes("email"));
  assert.ok(vars.includes("sujet"));
});
