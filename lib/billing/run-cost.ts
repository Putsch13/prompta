import { getModelPricing, getToolPricing, COMPUTE_FLAT_CENTS } from "@/lib/llm/pricing";
import type { StepUsage } from "@/lib/agent/orchestrator";

export interface RunUsage {
  steps: StepUsage[];
}

/** Coût réel d'un run en cents USD (approximation EUR 1:1 pour simplicité V1). */
export function computeRunCost(usage: RunUsage): number {
  let total = COMPUTE_FLAT_CENTS;

  for (const step of usage.steps) {
    if (step.model) {
      const pricing = getModelPricing(step.model);
      total +=
        (step.inputTokens / 1_000_000) * pricing.inputPer1M +
        (step.outputTokens / 1_000_000) * pricing.outputPer1M;
    }
    if (step.tool) total += getToolPricing(step.tool);
    if (step.connectorAction) total += getToolPricing(step.connectorAction);
  }

  return Math.ceil(total * 100) / 100;
}

/** Coût maximal théorique (worst case) pour pré-autorisation. */
export function estimateMaxCost(params: {
  stepCount: number;
  maxTokens: number;
  maxToolCalls: number;
}): number {
  const { stepCount, maxTokens, maxToolCalls } = params;
  const worstModel = getModelPricing("gpt-5.5");
  const llmCost =
    (maxTokens / 1_000_000) * (worstModel.inputPer1M + worstModel.outputPer1M) * stepCount;
  const toolCost = maxToolCalls * 2;
  return Math.ceil((llmCost + toolCost + COMPUTE_FLAT_CENTS) * 100) / 100;
}
