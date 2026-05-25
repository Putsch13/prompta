/**
 * agents/affiliate.ts
 * ────────────────────────────────────────────────────────────
 * AGENT 7 — Affiliate & Partenaires
 *
 * Rédige des messages d'approche pour recruter des créateurs
 * externes sur Prompta. Sortie en "pending" — tu valides chaque
 * message avant tout envoi. N'envoie rien automatiquement.
 */

import { callClaudeJSON } from "@/lib/agents/anthropic";
import { saveOutput } from "@/lib/agents/runner";
import type { AgentContext, AgentResult } from "@/lib/agents/types";

type OutreachMessage = {
  channel: "email" | "linkedin";
  subject: string;
  message: string;
};

// Profils-types de créateurs à approcher (personnalise selon ta cible)
const TARGET_PROFILES = [
  "créateur de contenu IA sur LinkedIn avec une audience B2B",
  "consultant en automatisation no-code",
  "rédacteur spécialisé en prompt engineering",
  "formateur en intelligence artificielle",
];

export async function runAffiliate(ctx: AgentContext): Promise<AgentResult> {
  const messagesPerRun = Number(ctx.config.messages_per_run ?? 2);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prompta.io";

  let produced = 0;

  for (let i = 0; i < messagesPerRun; i++) {
    const target = TARGET_PROFILES[i % TARGET_PROFILES.length];

    try {
      const { data: msg } = await callClaudeJSON<OutreachMessage>({
        system:
          "Tu es responsable partenariats pour Prompta. Tu rédiges des messages " +
          "d'approche personnalisés, courts, non-spammy, pour inviter des créateurs " +
          "à publier sur la marketplace. Réponds UNIQUEMENT en JSON.",
        prompt:
          `Rédige un message d'approche pour ce profil-cible : ${target}.\n` +
          `Argument clé : ils peuvent monétiser leurs prompts/agents sur Prompta ` +
          `avec Stripe Connect. Lien : ${appUrl}\n\n` +
          `JSON attendu :\n{\n` +
          `  "channel": "email" ou "linkedin",\n` +
          `  "subject": "objet si email, sinon vide",\n` +
          `  "message": "le message complet, personnalisable avec [PRÉNOM]"\n}`,
        maxTokens: 700,
        sandboxSample: {
          channel: "email",
          subject: "[SANDBOX] Partenariat Prompta",
          message: "Bonjour [PRÉNOM], message d'approche simulé en mode sandbox pour tester la chaîne.",
        },
      });

      await saveOutput(ctx, "affiliate", {
        kind: "outreach",
        title: `[${msg.channel}] ${target.slice(0, 50)}`,
        payload: { target_profile: target, ...msg },
      });

      produced++;
      await ctx.log("info", `✓ Message ${msg.channel} pour : ${target.slice(0, 40)}…`);
    } catch (err) {
      if (err instanceof Error && err.name === "BudgetBlockedError") throw err;
      await ctx.log("error", `Échec message : ${String(err).slice(0, 120)}`);
    }
  }

  return { itemsProduced: produced, summary: `${produced} message(s) d'approche à valider` };
}
