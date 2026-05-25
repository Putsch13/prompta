/**
 * Résout un identifiant de modèle du catalogue vers les paramètres API réels.
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
 * Résout un modèle avec fallback sur un modèle par défaut.
 */
export function resolveModelOrDefault(
  catalogId: string,
  defaultId = "gpt-5.4"
): ResolvedModel {
  const resolved = resolveModel(catalogId);
  if (resolved) return resolved;

  const defaultResolved = resolveModel(defaultId);
  if (defaultResolved) return defaultResolved;

  return {
    provider: "openai",
    apiModel: "gpt-5.4-turbo",
    tokenParam: "max_tokens",
    catalogId: "gpt-5.4",
  };
}

/**
 * Détermine le provider à partir d'un identifiant de modèle.
 */
export function getProviderFromModel(catalogId: string): LLMProvider {
  const resolved = resolveModel(catalogId);
  return resolved?.provider ?? "openai";
}
