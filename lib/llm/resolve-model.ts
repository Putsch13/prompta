/**
 * Résout un identifiant de modèle du catalogue vers les paramètres API réels.
 * Ne fait JAMAIS de fallback silencieux vers un modèle inventé.
 */

import { AI_MODELS, LEGACY_MODEL_MAP, type TokenParam } from "@/lib/catalogs";
import type { LLMProvider } from "./providers";

export interface ResolvedModel {
  provider: LLMProvider;
  apiModel: string;
  tokenParam: TokenParam;
  catalogId: string;
}

const PROVIDER_MAP: Record<string, LLMProvider> = {
  OpenAI: "openai",
  Anthropic: "anthropic",
  Google: "google",
  Mistral: "mistral",
};

/**
 * Résout un identifiant de catalogue (ou legacy) vers les infos API.
 * Retourne null si le modèle n'est pas trouvé.
 */
export function resolveModel(catalogId: string): ResolvedModel | null {
  const normalizedId = LEGACY_MODEL_MAP[catalogId] ?? catalogId;

  const model = AI_MODELS.find((m) => m.id === normalizedId);
  if (!model) return null;

  const provider = PROVIDER_MAP[model.provider];
  if (!provider) return null;

  return {
    provider,
    apiModel: model.apiModel,
    tokenParam: model.tokenParam,
    catalogId: model.id,
  };
}

/**
 * Résout un modèle avec fallback sur gpt-5.4-mini (modèle réel, pas inventé).
 */
export function resolveModelOrDefault(
  catalogId: string,
  defaultId = "gpt-5.4-mini"
): ResolvedModel {
  const resolved = resolveModel(catalogId);
  if (resolved) return resolved;

  const defaultResolved = resolveModel(defaultId);
  if (defaultResolved) return defaultResolved;

  // Dernier recours : gpt-5.4-mini est un vrai modèle OpenAI
  return {
    provider: "openai",
    apiModel: "gpt-5.4-mini",
    tokenParam: "max_completion_tokens",
    catalogId: "gpt-5.4-mini",
  };
}

/** Infère le paramètre de tokens OpenAI pour les modèles non catalogués. */
export function inferOpenAITokenParam(apiModel: string): TokenParam {
  if (/^o\d|^o-/.test(apiModel)) return "max_completion_tokens";
  if (/^gpt-[45]/.test(apiModel)) return "max_completion_tokens";
  return "max_tokens";
}

/**
 * Détermine le provider à partir d'un identifiant de modèle.
 */
export function getProviderFromModel(catalogId: string): LLMProvider {
  const resolved = resolveModel(catalogId);
  return resolved?.provider ?? "openai";
}
