/**
 * Validation statique du cas d'usage signature (sans appel LLM).
 * Usage : npx tsx scripts/validate-signature-agent.ts
 */

import { AgentManifestSchema } from "../lib/agent/schema";
import { SIGNATURE_EMAIL_AGENT } from "../lib/templates/signature-email-agent";
import { getAgentTemplate, AGENT_TEMPLATES } from "../lib/templates/agent-templates";
import { extractInputVariables, isFakeVariable } from "../lib/builder/variables";
import { buildManifest } from "../lib/builder/manifest";
import { shouldRunSync } from "../lib/builder/manifest";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

console.log("=== Validation agent signature ===\n");

const parsed = AgentManifestSchema.safeParse(SIGNATURE_EMAIL_AGENT.manifest);
assert(parsed.success, "Manifeste signature valide (Zod)");

assert(SIGNATURE_EMAIL_AGENT.manifest.steps.length === 2, "Agent signature = 2 étapes LLM");

const fakeVars = SIGNATURE_EMAIL_AGENT.manifest.inputs.filter((i) => isFakeVariable(i.key));
assert(fakeVars.length === 0, "Aucune variable parasite dans le manifeste");

for (const step of SIGNATURE_EMAIL_AGENT.manifest.steps) {
  if (step.type !== "llm") continue;
  const vars = extractInputVariables(step.prompt);
  assert(!vars.some(isFakeVariable), `Étape LLM sans fausse variable (${step.prompt.slice(0, 40)}…)`);
}

assert(shouldRunSync(SIGNATURE_EMAIL_AGENT.manifest), "Agent signature exécutable en sync (sans worker)");

const built = buildManifest({
  type: "agent",
  promptBody: "",
  steps: SIGNATURE_EMAIL_AGENT.manifest.steps,
  envFields: SIGNATURE_EMAIL_AGENT.manifest.inputs.map((i) => ({
    key: i.key,
    label: i.label,
    required: i.required,
    type: i.type,
    help: i.help,
  })),
  requiredSecrets: ["openai"],
});

assert(built.steps.length === 2, "buildManifest conserve 2 étapes");

const fromCatalog = getAgentTemplate("email-pro");
assert(!!fromCatalog, "Template email-pro présent dans le catalogue");

assert(AGENT_TEMPLATES.length >= 4, "Au moins 4 templates builder disponibles");

console.log("\n✅ Validation signature OK — prêt pour seed + test E2E manuel.");
