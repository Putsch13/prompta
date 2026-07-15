import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserKey } from "@/lib/keys";
import { AI_MODELS } from "@/lib/catalogs";
import type { LLMProvider } from "@/lib/llm/providers";

export const dynamic = "force-dynamic";

const PLATFORM_KEYS: Record<LLMProvider, string | undefined> = {
  openai: process.env.PLATFORM_OPENAI_KEY,
  anthropic: process.env.PLATFORM_ANTHROPIC_KEY ?? process.env.ANTHROPIC_API_KEY,
  google: process.env.PLATFORM_GOOGLE_KEY,
  mistral: process.env.PLATFORM_MISTRAL_KEY,
};

const PROVIDER_KEY: Record<string, LLMProvider> = {
  OpenAI: "openai",
  Anthropic: "anthropic",
  Google: "google",
  Mistral: "mistral",
};

/**
 * Modèles proposés au sélecteur de l'assistant (à la Cursor). Chaque modèle est
 * marqué `usable` selon qu'une clé (BYOK ou plateforme) existe pour son
 * fournisseur — on ne propose pas un modèle qui échouerait à coup sûr.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  // Un seul appel par fournisseur.
  const providers: LLMProvider[] = ["openai", "anthropic", "google", "mistral"];
  const usableByProvider: Partial<Record<LLMProvider, boolean>> = {};
  await Promise.all(
    providers.map(async (p) => {
      const userKey = await getUserKey(user.id, p).catch(() => null);
      usableByProvider[p] = Boolean(userKey || PLATFORM_KEYS[p]);
    }),
  );

  // On expose les modèles « populaires » de chaque fournisseur (assez pour
  // choisir GPT/Claude/Gemini/Mistral sans noyer l'utilisateur).
  const models = AI_MODELS.filter((m) => m.popular).map((m) => {
    const prov = PROVIDER_KEY[m.provider];
    return {
      id: m.id,
      label: m.label,
      provider: m.provider,
      usable: prov ? Boolean(usableByProvider[prov]) : false,
    };
  });

  return NextResponse.json({ models });
}
