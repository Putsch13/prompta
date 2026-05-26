import { AI_MODELS } from "@/lib/catalogs";
import { resolveModelOrDefault } from "./resolve-model";
import { getModelPricing } from "./pricing";

export type LLMProvider = "openai" | "anthropic" | "google" | "mistral";

const PROVIDER_LABEL_TO_KEY: Record<string, LLMProvider> = {
  OpenAI: "openai",
  Anthropic: "anthropic",
  Google: "google",
  Mistral: "mistral",
};

export interface ModelInfo {
  id: string;
  provider: LLMProvider;
  label: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

/** Modèles routables via la passerelle (OpenAI, Anthropic, Google, Mistral). */
export const MODEL_CATALOG: ModelInfo[] = AI_MODELS.filter((m) =>
  PROVIDER_LABEL_TO_KEY[m.provider]
).map((m) => {
  const pricing = getModelPricing(m.apiModel);
  return {
    id: m.id,
    provider: PROVIDER_LABEL_TO_KEY[m.provider],
    label: m.label,
    inputCostPer1M: pricing.inputPer1M / 100,
    outputCostPer1M: pricing.outputPer1M / 100,
  };
});

export function getModel(id: string): ModelInfo | undefined {
  const resolved = resolveModelOrDefault(id);
  return MODEL_CATALOG.find((m) => m.id === resolved.catalogId);
}

export function getModelsForProvider(provider: LLMProvider): ModelInfo[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const resolved = resolveModelOrDefault(modelId);
  const pricing = getModelPricing(resolved.apiModel);
  return (
    (inputTokens / 1_000_000) * (pricing.inputPer1M / 100) +
    (outputTokens / 1_000_000) * (pricing.outputPer1M / 100)
  );
}
