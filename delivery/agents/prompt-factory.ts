/**
 * agents/prompt-factory.ts
 * ────────────────────────────────────────────────────────────
 * AGENT 2 — Prompt Factory
 *
 * Génère des prompts (gratuits + payants) sous différents pseudos.
 * Chaque prompt est créé en mode "pending" → tu le valides dans /admin/agents.
 * Une fois approuvé, il est publié dans listings + listing_versions.
 *
 * Sécurité : passe par callClaude (budget), produit des outputs en
 * attente de validation, respecte un quota par run.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { callClaudeJSON } from "@/lib/agents/anthropic";
import { saveOutput } from "@/lib/agents/runner";
import type { AgentContext, AgentResult } from "@/lib/agents/types";

const CATEGORIES = [
  "Vente & Prospection", "Copywriting", "Marketing & Branding",
  "RH & Recrutement", "Développement", "Data & Analyse",
  "SEO & Contenu", "Réseaux sociaux", "Opérations", "Agents IA",
];
const PRICE_CENTS = [299, 499, 799, 999, 1499, 1999, 2499, 2999];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

type GeneratedPrompt = {
  title: string;
  description: string;
  prompt_body: string;
  tags: string[];
  quality_score: number;
};

export async function runPromptFactory(ctx: AgentContext): Promise<AgentResult> {
  const sb = createAdminClient();

  // Combien de prompts par run ? (config ou défaut)
  const perRun = Number(ctx.config.prompts_per_run ?? 5);
  const freeRatio = Number(ctx.config.free_ratio ?? 0.7);
  const minQuality = Number(ctx.config.min_quality ?? 65);

  await ctx.log("info", `Objectif : ${perRun} prompts (ratio gratuit ${freeRatio * 100}%)`);

  // Sélectionne les personas les moins récemment utilisés
  const { data: personas } = await sb
    .from("personas")
    .select("*")
    .eq("is_active", true)
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .limit(perRun);

  if (!personas || personas.length === 0) {
    await ctx.log("warn", "Aucun persona actif — exécute le seed des personas.");
    return { itemsProduced: 0, summary: "0 prompt (pas de persona)" };
  }

  let produced = 0;

  for (let i = 0; i < perRun; i++) {
    const persona = personas[i % personas.length];
    const isFree = Math.random() < freeRatio;
    const category = pick(CATEGORIES);
    const lang = persona.language === "fr" ? "français" : "English";

    try {
      const { data: gen } = await callClaudeJSON<GeneratedPrompt>({
        system:
          `Tu es ${persona.display_name}, expert en ${persona.specialty}. ` +
          `Ton ton : ${persona.tone}. Tu crées des prompts IA professionnels pour la marketplace Prompta. ` +
          `Réponds UNIQUEMENT en JSON valide, sans markdown.`,
        prompt:
          `Crée ${isFree ? "un prompt GRATUIT utile qui donne envie de découvrir Prompta" : "un prompt PREMIUM de haute valeur qui justifie son prix"} ` +
          `dans la catégorie "${category}" en ${lang}.\n\n` +
          `JSON attendu :\n{\n` +
          `  "title": "max 70 caractères",\n` +
          `  "description": "max 200 caractères",\n` +
          `  "prompt_body": "le prompt complet, prêt à l'emploi, avec [VARIABLES] si besoin",\n` +
          `  "tags": ["tag1","tag2","tag3"],\n` +
          `  "quality_score": 0\n}\n\n` +
          `quality_score (0-100) : clarté/30 + utilité/30 + originalité/20 + professionnalisme/20.`,
        maxTokens: 1100,
        // Donnée simulée en mode sandbox (aucun coût API)
        sandboxSample: {
          title: `[SANDBOX] Prompt ${category}`,
          description: "Exemple de prompt généré en mode sandbox pour tester la chaîne.",
          prompt_body: `Tu es un expert en ${category}. Aide-moi à [OBJECTIF] en tenant compte de [CONTEXTE].`,
          tags: ["sandbox", "test", category.toLowerCase()],
          quality_score: 78,
        },
      });

      const score = Math.min(100, Math.max(0, Number(gen.quality_score ?? 70)));

      if (score < minQuality) {
        await ctx.log("warn", `Rejeté (score ${score}) : ${gen.title}`);
        continue;
      }

      // Enregistre comme OUTPUT en attente de validation — pas encore publié
      await saveOutput(ctx, "prompt_factory", {
        kind: "prompt",
        title: gen.title,
        qualityScore: score,
        payload: {
          persona_id: persona.id,
          persona_username: persona.username,
          description: gen.description,
          prompt_body: gen.prompt_body,
          category,
          tags: gen.tags,
          is_free: isFree,
          price_cents: isFree ? 0 : pick(PRICE_CENTS),
          type: "prompt",
        },
      });

      // Marque le persona comme utilisé
      await sb
        .from("personas")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", persona.id);

      produced++;
      await ctx.log("info", `✓ ${gen.title} (score ${score}, @${persona.username})`);
    } catch (err) {
      // BudgetBlockedError est relancée pour stopper le run proprement
      if (err instanceof Error && err.name === "BudgetBlockedError") throw err;
      await ctx.log("error", `Échec génération : ${String(err).slice(0, 120)}`);
    }
  }

  return {
    itemsProduced: produced,
    summary: `${produced} prompt(s) en attente de validation`,
  };
}
