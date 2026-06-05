import type { AgentManifest, AgentStep } from "@/lib/agent/schema";
import { dedupeConnectors } from "@/lib/connectors/resolve-id";

function collectActionSteps(steps: AgentStep[]): Extract<AgentStep, { type: "action" }>[] {
  const out: Extract<AgentStep, { type: "action" }>[] = [];
  for (const step of steps) {
    if (step.type === "action") out.push(step);
    if (step.type === "parallel") {
      for (const branch of step.branches) {
        out.push(...collectActionSteps(branch.steps as AgentStep[]));
      }
    }
  }
  return out;
}

/** Connecteurs que le runner courant doit avoir branchés (hors env partagée builder). */
export function runnerRequiredConnectors(
  manifest: AgentManifest,
  options: { userId: string; creatorId?: string },
): string[] {
  const subscriberRun =
    options.creatorId != null && options.creatorId !== options.userId;
  const connectors = collectActionSteps(manifest.steps)
    .filter((step) => !(subscriberRun && step.sharedEnv))
    .map((step) => step.connector);
  return dedupeConnectors(connectors);
}
