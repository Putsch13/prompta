import type { AgentManifest } from "@/lib/agent/schema";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { getModelPricing, getToolPricing, COMPUTE_FLAT_CENTS } from "@/lib/llm/pricing";

/** Estimation pessimiste basée sur les modèles réels du manifeste. */
export function estimateMaxCostForManifest(manifest: AgentManifest): number {
  let total = COMPUTE_FLAT_CENTS;
  let toolCalls = 0;

  // Les sous-étapes des branches parallèles coûtent aussi — les ignorer
  // sous-estimait le hold de crédits.
  const flatSteps = manifest.steps.flatMap((s) =>
    s.type === "parallel" ? s.branches.flatMap((b) => b.steps) : [s],
  );

  for (const step of flatSteps) {
    if (step.type === "llm") {
      const { apiModel } = resolveModelOrDefault(step.model);
      const pricing = getModelPricing(apiModel);
      const maxTokens = Math.min(manifest.limits.max_tokens, 4096);
      total +=
        (maxTokens / 1_000_000) * (pricing.inputPer1M + pricing.outputPer1M);
    }
    if (step.type === "tool") {
      toolCalls++;
      total += getToolPricing(step.tool);
    }
    if (step.type === "action") {
      toolCalls++;
      total += getToolPricing(step.action);
    }
  }

  const maxTools = manifest.limits.max_tool_calls ?? 5;
  if (toolCalls > maxTools) toolCalls = maxTools;

  return Math.ceil(total * 100) / 100;
}
