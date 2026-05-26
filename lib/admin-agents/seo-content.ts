/**
 * agents/seo-content.ts
 * ────────────────────────────────────────────────────────────
 * AGENT 3 — SEO Content
 *
 * Génère des articles de blog optimisés SEO autour des prompts
 * publiés. Sortie en "pending" → validation → publication blog.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { callClaudeJSON } from "@/lib/agents/anthropic";
import { saveOutput } from "@/lib/agents/runner";
import type { AgentContext, AgentResult } from "@/lib/agents/types";

type BlogArticle = {
  title: string;
  slug: string;
  meta_description: string;
  intro: string;
  sections: { heading: string; content: string }[];
  conclusion: string;
  keywords: string[];
};

export async function runSeoContent(ctx: AgentContext): Promise<AgentResult> {
  const sb = createAdminClient();
  const articlesPerRun = Number(ctx.config.articles_per_run ?? 1);

  // Trouve les catégories les plus actives pour cibler le contenu
  const { data: listings } = await sb
    .from("listings")
    .select("title, category_id, tags")
    .eq("status", "published")
    .limit(40);

  // Agrège les tags les plus fréquents → sujets d'articles
  const tagCount = new Map<string, number>();
  (listings ?? []).forEach((l) =>
    (l.tags ?? []).forEach((t: string) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1))
  );
  const topTopics = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, articlesPerRun)
    .map(([t]) => t);

  if (topTopics.length === 0) topTopics.push("prompts IA pour la productivité");

  let produced = 0;

  for (const topic of topTopics) {
    try {
      const { data: article } = await callClaudeJSON<BlogArticle>({
        system:
          "Tu es rédacteur SEO expert pour le blog de Prompta. Tu écris des " +
          "articles utiles, structurés, optimisés pour le référencement naturel. " +
          "Réponds UNIQUEMENT en JSON valide.",
        prompt:
          `Rédige un article de blog SEO en français sur le thème : "${topic}".\n` +
          `L'article doit donner envie de découvrir les prompts de Prompta.\n\n` +
          `JSON attendu :\n{\n` +
          `  "title": "titre optimisé SEO, max 65 caractères",\n` +
          `  "slug": "slug-url-en-minuscules",\n` +
          `  "meta_description": "max 155 caractères",\n` +
          `  "intro": "paragraphe d'introduction",\n` +
          `  "sections": [{ "heading": "...", "content": "2-3 paragraphes" }],\n` +
          `  "conclusion": "paragraphe de conclusion avec invitation",\n` +
          `  "keywords": ["mot-clé 1","mot-clé 2"]\n}\n\n` +
          `Vise 4 à 6 sections.`,
        maxTokens: 2500,
        sandboxSample: {
          title: `[SANDBOX] Guide : ${topic}`,
          slug: "sandbox-guide-test",
          meta_description: "Article simulé en mode sandbox pour tester la chaîne SEO.",
          intro: "Ceci est une introduction générée en mode sandbox.",
          sections: [
            { heading: "Section 1 (sandbox)", content: "Contenu de test." },
            { heading: "Section 2 (sandbox)", content: "Contenu de test." },
          ],
          conclusion: "Conclusion simulée.",
          keywords: ["sandbox", "test"],
        },
      });

      await saveOutput(ctx, "seo_content", {
        kind: "blog_article",
        title: article.title,
        payload: { topic, ...article },
      });

      produced++;
      await ctx.log("info", `✓ Article : ${article.title}`);
    } catch (err) {
      if (err instanceof Error && err.name === "BudgetBlockedError") throw err;
      await ctx.log("error", `Échec article : ${String(err).slice(0, 120)}`);
    }
  }

  return { itemsProduced: produced, summary: `${produced} article(s) de blog à valider` };
}
