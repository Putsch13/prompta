import { AI_MODELS } from "@/lib/catalogs";
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
