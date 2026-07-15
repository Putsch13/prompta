/**
 * Tarifs fournisseurs — valeurs à mettre à jour quand un fournisseur change ses prix.
 * Prix en cents USD par 1M tokens (input / output).
 * IDs = vrais apiModel IDs (pas de slugs inventés).
 */

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI GPT-5.x
  "gpt-5.5": { inputPer1M: 500, outputPer1M: 1500 },
  "gpt-5.4": { inputPer1M: 400, outputPer1M: 1200 },
  "gpt-5.4-mini": { inputPer1M: 150, outputPer1M: 600 },
  "gpt-5.4-nano": { inputPer1M: 50, outputPer1M: 200 },
  "gpt-5-mini": { inputPer1M: 100, outputPer1M: 400 },
  "gpt-5-nano": { inputPer1M: 50, outputPer1M: 200 },
  // OpenAI GPT-4.1 (legacy)
  "gpt-4.1": { inputPer1M: 200, outputPer1M: 800 },
  "gpt-4.1-mini": { inputPer1M: 40, outputPer1M: 160 },
  "gpt-4.1-nano": { inputPer1M: 10, outputPer1M: 40 },
  // OpenAI reasoning
  o3: { inputPer1M: 2000, outputPer1M: 8000 },
  "o3-mini": { inputPer1M: 1100, outputPer1M: 4400 },
  "o4-mini": { inputPer1M: 1100, outputPer1M: 4400 },
  // Anthropic
  "claude-opus-4-7": { inputPer1M: 1500, outputPer1M: 7500 },
  "claude-opus-4-6": { inputPer1M: 1200, outputPer1M: 6000 },
  "claude-sonnet-4-6": { inputPer1M: 300, outputPer1M: 1500 },
  "claude-haiku-4-5": { inputPer1M: 80, outputPer1M: 400 },
  // Google
  "gemini-3.5-flash": { inputPer1M: 50, outputPer1M: 200 },
  "gemini-2.5-pro": { inputPer1M: 200, outputPer1M: 800 },
  "gemini-2.5-flash": { inputPer1M: 50, outputPer1M: 200 },
  // Mistral
  "mistral-large-latest": { inputPer1M: 200, outputPer1M: 600 },
  "mistral-medium-latest": { inputPer1M: 150, outputPer1M: 450 },
  "mistral-small-latest": { inputPer1M: 50, outputPer1M: 150 },
};

export const COMPOSIO_TOOL_CALL_CENTS = 0.03;

export const TOOL_PRICING: Record<string, number> = {
  web_search: 1,
  http_fetch: 0,
  web_fetch: 0,
  file_read: 0,
  "gmail.send": 0,
  "gmail.read": 0,
  "sheets.read": 0,
  "sheets.append": 0,
  "slack.send": 0,
  "telegram.send": 0,
  "canva.create": 2,
  composio_action: COMPOSIO_TOOL_CALL_CENTS,
};

export const COMPUTE_FLAT_CENTS = 0.5;

export function getModelPricing(apiModel: string): ModelPricing {
  return MODEL_PRICING[apiModel] ?? { inputPer1M: 300, outputPer1M: 1200 };
}

export function getToolPricing(toolOrAction: string): number {
  if (TOOL_PRICING[toolOrAction] !== undefined) return TOOL_PRICING[toolOrAction];
  if (toolOrAction.includes(".") && toolOrAction === toolOrAction.toLowerCase()) {
    return TOOL_PRICING[toolOrAction] ?? 0;
  }
  return COMPOSIO_TOOL_CALL_CENTS;
}
