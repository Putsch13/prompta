export type LLMProvider = "openai" | "anthropic" | "google" | "mistral";

export interface ModelInfo {
  id: string;
  provider: LLMProvider;
  label: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export const MODEL_CATALOG: ModelInfo[] = [
  { id: "gpt-4o", provider: "openai", label: "GPT-4o", inputCostPer1M: 2.5, outputCostPer1M: 10 },
  { id: "gpt-4o-mini", provider: "openai", label: "GPT-4o Mini", inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  { id: "claude-sonnet-4-20250514", provider: "anthropic", label: "Claude Sonnet", inputCostPer1M: 3, outputCostPer1M: 15 },
  { id: "claude-3-5-haiku-20241022", provider: "anthropic", label: "Claude Haiku", inputCostPer1M: 0.8, outputCostPer1M: 4 },
  { id: "gemini-2.0-flash", provider: "google", label: "Gemini 2.0 Flash", inputCostPer1M: 0.1, outputCostPer1M: 0.4 },
  { id: "mistral-large-latest", provider: "mistral", label: "Mistral Large", inputCostPer1M: 2, outputCostPer1M: 6 },
];

export function getModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function getModelsForProvider(provider: LLMProvider): ModelInfo[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const model = getModel(modelId);
  if (!model) return 0;
  return (
    (inputTokens / 1_000_000) * model.inputCostPer1M +
    (outputTokens / 1_000_000) * model.outputCostPer1M
  );
}
