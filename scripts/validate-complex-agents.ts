/**
 * Valide les 100 agents du catalogue complexe contre le validateur builder.
 *
 * Usage: npx tsx scripts/validate-complex-agents.ts
 */

import { COMPLEX_AGENT_CATALOG, getCatalogStats } from "../lib/templates/complex-agent-catalog";
import { validateAgentManifest, hasBlockingIssues } from "../lib/builder/validate-agent";
import { AgentManifestSchema } from "../lib/agent/schema";
import { buildManifest } from "../lib/builder/manifest";

const stats = getCatalogStats();
console.log("Catalogue:", stats);

let ok = 0;
let schemaFail = 0;
let validationFail = 0;
const failures: { id: string; title: string; errors: string[] }[] = [];

for (const agent of COMPLEX_AGENT_CATALOG) {
  const manifest = buildManifest({
    type: agent.steps.length > 2 ? "agent" : "workflow",
    promptBody: agent.description,
    steps: agent.steps,
    envFields: agent.inputFields.map((f) => ({
      key: f.key,
      label: f.label,
      required: true,
      type: f.type as "text" | "textarea" | "number" | "file" | "list",
    })),
    requiredSecrets: agent.requiredSecrets,
    requiredConnectors: agent.requiredConnectors,
    defaultModel: agent.models[0],
  });

  const parsed = AgentManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    schemaFail++;
    failures.push({
      id: agent.id,
      title: agent.title,
      errors: ["Schema Zod: " + parsed.error.issues.map((i) => i.message).join("; ")],
    });
    continue;
  }

  const issues = validateAgentManifest(parsed.data.steps, {
    connectors: parsed.data.connectors,
    inputKeys: parsed.data.inputs.map((i) => i.key),
  });
  if (hasBlockingIssues(issues)) {
    validationFail++;
    failures.push({
      id: agent.id,
      title: agent.title,
      errors: issues.filter((i) => i.severity === "error").map((i) => i.message),
    });
    continue;
  }

  ok++;
}

console.log("\n── Résultats ──");
console.log(`✅ Valides: ${ok}/${COMPLEX_AGENT_CATALOG.length}`);
console.log(`❌ Schema Zod: ${schemaFail}`);
console.log(`❌ Validation builder: ${validationFail}`);

if (failures.length > 0) {
  console.log("\n── Échecs ──");
  for (const f of failures.slice(0, 20)) {
    console.log(`\n[${f.id}] ${f.title}`);
    for (const e of f.errors) console.log(`  - ${e}`);
  }
  if (failures.length > 20) {
    console.log(`\n… et ${failures.length - 20} autres`);
  }
  process.exit(1);
}

console.log("\nTous les agents du catalogue passent la validation.");
