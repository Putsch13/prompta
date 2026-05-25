/**
 * agents/linkedin-publisher.ts
 * ────────────────────────────────────────────────────────────
 * AGENT 1 — LinkedIn Publisher
 *
 * Rédige des posts LinkedIn qui font la promo de Prompta et
 * renvoient vers un prompt gratuit. Les posts sont créés en mode
 * "pending" : tu les valides puis tu les publies toi-même sur
 * LinkedIn (copier-coller) ou via un connecteur plus tard.
 *
 * Important : il ne publie RIEN automatiquement sur LinkedIn.
 * Il prépare le contenu, tu gardes le contrôle.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { callClaudeJSON } from "@/lib/agents/anthropic";
import { saveOutput } from "@/lib/agents/runner";
import type { AgentContext, AgentResult } from "@/lib/agents/types";

const ANGLES = [
  "partage d'un prompt concret avec un résultat avant/après",
  "retour d'expérience sur un gain de temps grâce à l'IA",
  "erreur fréquente que font les gens en utilisant l'IA",
  "mini-tutoriel en 3 étapes",
  "question ouverte qui invite au débat en commentaires",
];

type LinkedinPost = {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
};

export async function runLinkedinPublisher(ctx: AgentContext): Promise<AgentResult> {
  const sb = createAdminClient();
  const postsPerRun = Number(ctx.config.posts_per_run ?? 1);

  // Récupère un prompt gratuit publié récemment pour le mettre en avant
  const { data: featured } = await sb
    .from("listings")
    .select("title, slug, description")
    .eq("status", "published")
    .eq("price_cents", 0)
    .order("created_at", { ascending: false })
    .limit(5);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prompta.io";
  let produced = 0;

  for (let i = 0; i < postsPerRun; i++) {
    const angle = ANGLES[i % ANGLES.length];
    const promo = featured?.[i % (featured.length || 1)];
    const link = promo ? `${appUrl}/listing/${promo.slug}` : appUrl;

    try {
      const { data: post } = await callClaudeJSON<LinkedinPost>({
        system:
          "Tu es un community manager expert LinkedIn pour Prompta, " +
          "une marketplace de prompts et agents IA. Tu écris des posts " +
          "authentiques, sans jargon marketing, qui apportent de la valeur. " +
          "Réponds UNIQUEMENT en JSON valide.",
        prompt:
          `Rédige un post LinkedIn en français selon cet angle : ${angle}.\n` +
          (promo
            ? `Le post doit subtilement renvoyer vers ce prompt gratuit : "${promo.title}" (${link}).\n`
            : `Le post renvoie vers Prompta : ${link}.\n`) +
          `\nJSON attendu :\n{\n` +
          `  "hook": "1re ligne accrocheuse qui stoppe le scroll",\n` +
          `  "body": "corps du post, 3-6 courts paragraphes, ton humain",\n` +
          `  "cta": "appel à l'action avec le lien",\n` +
          `  "hashtags": ["#IA","#Productivité","#Prompts"]\n}`,
        maxTokens: 900,
        sandboxSample: {
          hook: "[SANDBOX] J'ai testé un prompt qui m'a fait gagner 2h cette semaine.",
          body: "Voici ce que j'ai découvert en mode sandbox.\n\nCeci est un post simulé pour tester la chaîne sans coût API.",
          cta: `Découvre-le ici : ${appUrl}`,
          hashtags: ["#IA", "#Productivité", "#Sandbox"],
        },
      });

      await saveOutput(ctx, "linkedin_publisher", {
        kind: "linkedin_post",
        title: post.hook.slice(0, 80),
        payload: {
          angle,
          full_text: `${post.hook}\n\n${post.body}\n\n${post.cta}\n\n${post.hashtags.join(" ")}`,
          hook: post.hook,
          body: post.body,
          cta: post.cta,
          hashtags: post.hashtags,
          featured_listing: promo?.slug ?? null,
          link,
        },
      });

      produced++;
      await ctx.log("info", `✓ Post préparé : ${post.hook.slice(0, 50)}…`);
    } catch (err) {
      if (err instanceof Error && err.name === "BudgetBlockedError") throw err;
      await ctx.log("error", `Échec post : ${String(err).slice(0, 120)}`);
    }
  }

  return { itemsProduced: produced, summary: `${produced} post(s) LinkedIn à valider` };
}
