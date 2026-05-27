import type { AgentManifest } from "@/lib/agent/schema";
import { validateAgentManifest, hasBlockingIssues } from "@/lib/builder/validate-agent";

export function getManifestValidationErrors(manifest: AgentManifest): string[] {
  const issues = validateAgentManifest(manifest.steps, {
    connectors: manifest.connectors,
  });
  return issues
    .filter((i) => i.severity === "error")
    .map((i) => i.message);
}

export function assertManifestValidForPublish(manifest: AgentManifest): void {
  const errors = getManifestValidationErrors(manifest);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
  if (hasBlockingIssues(validateAgentManifest(manifest.steps, { connectors: manifest.connectors }))) {
    throw new Error("Manifeste agent invalide");
  }
}
