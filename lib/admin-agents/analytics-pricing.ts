/**
 * agents/analytics-pricing.ts
 * ────────────────────────────────────────────────────────────
 * AGENT 6 — Analytics & Pricing
 *
 * Analyse les ventes et suggère des ajustements de prix.
 * Produit des suggestions en "pending" — AUCUN prix n'est changé
 * sans ta validation.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { callClaudeJSON } from "@/lib/agents/anthropic";
import { saveOutput } from "@/lib/agents/runner";
import type { AgentContext, AgentResult } from "@/lib/agents/types";

type PricingAnalysis = {
  suggestions: {
    listing_id: string;
    listing_title: string;
    current_price_cents: number;
    suggested_price_cents: number;
    reasoning: string;
  }[];
  overview: string;
};

export async function runAnalyticsPricing(ctx: AgentContext): Promise<AgentResult> {
  const sb = createAdminClient();

  // Récupère les listings payants + leur nombre de ventes
  const { data: listings } = await sb
    .from("listings")
    .select("id, title, price_cents")
    .eq("status", "published")
    .gt("price_cents", 0)
    .limit(30);

  if (!listings || listings.length === 0) {
    return { itemsProduced: 0, summary: "Aucun listing payant à analyser" };
  }

  // Compte les ventes par listing
  const stats: { id: string; title: string; price_cents: number; sales: number }[] = [];
  for (const l of listings) {
    const { count } = await sb
      .from("purchases")
      .select("*", { count: "exact", head: true })
      .eq("listing_id", l.id)
      .eq("status", "completed");
    stats.push({ id: l.id, title: l.title, price_cents: l.price_cents, sales: count ?? 0 });
  }

  try {
    const { data: analysis } = await callClaudeJSON<PricingAnalysis>({
      system:
        "Tu es analyste pricing pour Prompta. À partir des ventes, tu suggères " +
        "des ajustements de prix raisonnables (jamais plus de ±40%). " +
        "Réponds UNIQUEMENT en JSON.",
      prompt:
        `Voici les listings payants et leurs ventes :\n` +
        stats
          .map(
            (s) =>
              `- ${s.title} | prix ${(s.price_cents / 100).toFixed(2)}€ | ${s.sales} vente(s) | id=${s.id}`
          )
          .join("\n") +
        `\n\nJSON attendu :\n{\n` +
        `  "overview": "synthèse en 2-3 phrases",\n` +
        `  "suggestions": [{\n` +
        `    "listing_id": "...", "listing_title": "...",\n` +
        `    "current_price_cents": 0, "suggested_price_cents": 0,\n` +
        `    "reasoning": "..."\n  }]\n}\n\n` +
        `Ne suggère un changement que si c'est justifié. Max 8 suggestions.`,
      maxTokens: 1800,
      sandboxSample: {
        overview: "[SANDBOX] Analyse simulée — aucune donnée réelle traitée.",
        suggestions: stats.slice(0, 2).map((s) => ({
          listing_id: s.id,
          listing_title: s.title,
          current_price_cents: s.price_cents,
          suggested_price_cents: s.price_cents,
          reasoning: "Suggestion simulée en mode sandbox.",
        })),
      },
    });

    // Une seule sortie : le rapport complet avec les suggestions
    await saveOutput(ctx, "analytics_pricing", {
      kind: "price_suggestion",
      title: `Analyse pricing — ${new Date().toLocaleDateString("fr-FR")}`,
      payload: { ...analysis, generated_at: new Date().toISOString() },
    });

    await ctx.log("info", `✓ ${analysis.suggestions.length} suggestion(s) de prix`);
    return {
      itemsProduced: analysis.suggestions.length,
      summary: `Rapport pricing avec ${analysis.suggestions.length} suggestion(s)`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "BudgetBlockedError") throw err;
    await ctx.log("error", `Échec analyse : ${String(err).slice(0, 120)}`);
    return { itemsProduced: 0, summary: "Échec de l'analyse" };
  }
}
