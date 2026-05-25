/**
 * agents/moderation.ts
 * ────────────────────────────────────────────────────────────
 * AGENT 4 — Modération & Qualité
 *
 * Passe en revue les listings récemment publiés. Détecte les
 * contenus problématiques et les signale dans moderation_flags.
 *
 * C'est le SEUL agent qui peut agir sans validation manuelle,
 * MAIS uniquement pour SIGNALER (jamais supprimer). La décision
 * finale reste la tienne dans l'admin.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { callClaudeJSON } from "@/lib/agents/anthropic";
import type { AgentContext, AgentResult } from "@/lib/agents/types";

type Verdict = {
  ok: boolean;
  quality_score: number;
  issues: string[];
  reason: string;
};

export async function runModeration(ctx: AgentContext): Promise<AgentResult> {
  const sb = createAdminClient();
  const batchSize = Number(ctx.config.batch_size ?? 10);

  // Listings récents non encore modérés (pas de flag existant)
  const { data: listings } = await sb
    .from("listings")
    .select("id, title, description, tags, status")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(batchSize);

  if (!listings || listings.length === 0) {
    return { itemsProduced: 0, summary: "Rien à modérer" };
  }

  let flagged = 0;

  for (const l of listings) {
    // Évite de re-modérer ce qui a déjà un flag
    const { count } = await sb
      .from("moderation_flags")
      .select("*", { count: "exact", head: true })
      .eq("listing_id", l.id);
    if ((count ?? 0) > 0) continue;

    try {
      const { data: verdict } = await callClaudeJSON<Verdict>({
        system:
          "Tu es modérateur de contenu pour Prompta. Tu évalues si un " +
          "listing est de qualité acceptable et sans contenu problématique " +
          "(spam, contenu trompeur, illégal, offensant). Réponds UNIQUEMENT en JSON.",
        prompt:
          `Évalue ce listing :\nTitre : ${l.title}\nDescription : ${l.description ?? "(vide)"}\n` +
          `Tags : ${(l.tags ?? []).join(", ")}\n\n` +
          `JSON attendu :\n{\n` +
          `  "ok": true,\n` +
          `  "quality_score": 0,\n` +
          `  "issues": ["liste des problèmes éventuels"],\n` +
          `  "reason": "explication courte"\n}`,
        maxTokens: 400,
        sandboxSample: {
          ok: true,
          quality_score: 82,
          issues: [],
          reason: "[sandbox] Évaluation simulée — listing considéré OK.",
        },
      });

      if (!verdict.ok || verdict.quality_score < 50 || verdict.issues.length > 0) {
        await sb.from("moderation_flags").insert({
          listing_id: l.id,
          reason: `[auto] ${verdict.reason} — ${verdict.issues.join("; ")}`,
          status: "open",
        });
        flagged++;
        await ctx.log("warn", `⚠ Signalé : ${l.title} (score ${verdict.quality_score})`);
      } else {
        await ctx.log("info", `✓ OK : ${l.title} (score ${verdict.quality_score})`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "BudgetBlockedError") throw err;
      await ctx.log("error", `Échec modération : ${String(err).slice(0, 120)}`);
    }
  }

  return { itemsProduced: flagged, summary: `${flagged} listing(s) signalé(s) pour revue` };
}
