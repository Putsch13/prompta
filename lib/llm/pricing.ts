/**
 * Tarifs fournisseurs — valeurs à mettre à jour quand un fournisseur change ses prix.
 * Prix en cents USD par 1M tokens (input / output).
 */

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/** Tarifs modèles (catalogue mai 2026) — cents USD par 1M tokens */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.5-turbo": { inputPer1M: 500, outputPer1M: 1500 },
  "gpt-5.4-turbo": { inputPer1M: 400, outputPer1M: 1200 },
  "gpt-5.4-mini": { inputPer1M: 150, outputPer1M: 600 },
  "gpt-5-mini": { inputPer1M: 100, outputPer1M: 400 },
  "gpt-5-nano": { inputPer1M: 50, outputPer1M: 200 },
  o3: { inputPer1M: 2000, outputPer1M: 8000 },
  "o3-mini": { inputPer1M: 1100, outputPer1M: 4400 },
  "claude-opus-4-7-20260501": { inputPer1M: 1500, outputPer1M: 7500 },
  "claude-opus-4-6-20260315": { inputPer1M: 1200, outputPer1M: 6000 },
  "claude-sonnet-4-6-20260401": { inputPer1M: 300, outputPer1M: 1500 },
  "claude-haiku-4-5-20260201": { inputPer1M: 80, outputPer1M: 400 },
  "gemini-3.1-pro": { inputPer1M: 200, outputPer1M: 800 },
  "gemini-3.0-flash": { inputPer1M: 50, outputPer1M: 200 },
  "mistral-large-latest": { inputPer1M: 200, outputPer1M: 600 },
  "mistral-medium-latest": { inputPer1M: 150, outputPer1M: 450 },
  "mistral-small-latest": { inputPer1M: 50, outputPer1M: 150 },
};

export const TOOL_PRICING: Record<string, number> = {
  web_search: 1, // cents par appel Serper
  http_fetch: 0,
  file_read: 0,
  "gmail.send": 0,
  "gmail.read": 0,
  "sheets.read": 0,
  "sheets.append": 0,
  "slack.send": 0,
  "telegram.send": 0,
  "canva.create": 2,
};

export const COMPUTE_FLAT_CENTS = 0.5;

export function getModelPricing(apiModel: string): ModelPricing {
  return MODEL_PRICING[apiModel] ?? { inputPer1M: 300, outputPer1M: 1200 };
}

export function getToolPricing(toolOrAction: string): number {
  return TOOL_PRICING[toolOrAction] ?? 0;
}
