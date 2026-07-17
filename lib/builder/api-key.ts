import { getUserKey, type KeyProvider } from "@/lib/keys";
import type { LLMProvider } from "@/lib/llm/providers";
import { resolveModelOrDefault, type ResolvedModel } from "@/lib/llm/resolve-model";

const PLATFORM_KEYS: Record<LLMProvider, string | undefined> = {
  openai: process.env.PLATFORM_OPENAI_KEY,
  anthropic: process.env.PLATFORM_ANTHROPIC_KEY ?? process.env.ANTHROPIC_API_KEY,
  google: process.env.PLATFORM_GOOGLE_KEY,
  mistral: process.env.PLATFORM_MISTRAL_KEY,
};

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  mistral: "Mistral",
};

export type BuilderApiKeyResult =
  | { ok: true; apiKey: string; resolved: ResolvedModel; source: "byok" | "platform" }
  | { ok: false; error: string };

export async function getBuilderApiKey(
  userId: string,
  modelId: string
): Promise<BuilderApiKeyResult> {
  const resolved = resolveModelOrDefault(modelId);
  const provider = resolved.provider as KeyProvider;

  let source: "byok" | "platform" = "byok";
  let apiKey = await getUserKey(userId, provider);
  if (!apiKey) {
    apiKey = PLATFORM_KEYS[resolved.provider] ?? null;
    source = "platform";
  }

  if (!apiKey) {
    return {
      ok: false,
      error: `Clé ${PROVIDER_LABELS[resolved.provider]} requise (BYOK ou plateforme) pour la génération IA.`,
    };
  }

  return { ok: true, apiKey, resolved, source };
}
