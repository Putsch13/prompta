/**
 * agents/email-crm.ts
 * ────────────────────────────────────────────────────────────
 * AGENT 5 — Email & CRM
 *
 * Prépare des séquences email (bienvenue, prompt du jour, relance).
 * Sortie en "pending" → tu valides → envoi via Resend.
 *
 * N'envoie AUCUN email tout seul. Il rédige, tu approuves.
 */

import { callClaudeJSON } from "@/lib/agents/anthropic";
import { saveOutput } from "@/lib/agents/runner";
import type { AgentContext, AgentResult } from "@/lib/agents/types";

type EmailDraft = {
  subject: string;
  preheader: string;
  body_html: string;
  body_text: string;
};

const SEQUENCES = [
  { id: "welcome", brief: "email de bienvenue pour un nouvel inscrit qui découvre Prompta" },
  { id: "prompt_of_day", brief: "email hebdomadaire 'prompt du jour' qui met en avant un prompt utile" },
  { id: "winback", brief: "email de réactivation pour un utilisateur inactif depuis 30 jours" },
];

export async function runEmailCrm(ctx: AgentContext): Promise<AgentResult> {
  const which = String(ctx.config.sequence ?? "all");
  const targets = which === "all" ? SEQUENCES : SEQUENCES.filter((s) => s.id === which);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prompta.io";

  let produced = 0;

  for (const seq of targets) {
    try {
      const { data: email } = await callClaudeJSON<EmailDraft>({
        system:
          "Tu es responsable CRM pour Prompta, marketplace de prompts IA. " +
          "Tu écris des emails clairs, chaleureux, sans spam. Réponds UNIQUEMENT en JSON.",
        prompt:
          `Rédige un ${seq.brief}.\nLien du site : ${appUrl}\n\n` +
          `JSON attendu :\n{\n` +
          `  "subject": "objet, max 50 caractères",\n` +
          `  "preheader": "texte de prévisualisation, max 90 caractères",\n` +
          `  "body_html": "corps en HTML simple (p, a, strong)",\n` +
          `  "body_text": "version texte brut"\n}`,
        maxTokens: 1200,
        sandboxSample: {
          subject: `[SANDBOX] ${seq.id}`,
          preheader: "Email simulé en mode sandbox.",
          body_html: "<p>Ceci est un email de test généré en mode sandbox.</p>",
          body_text: "Ceci est un email de test généré en mode sandbox.",
        },
      });

      await saveOutput(ctx, "email_crm", {
        kind: "email",
        title: `[${seq.id}] ${email.subject}`,
        payload: { sequence: seq.id, ...email },
      });

      produced++;
      await ctx.log("info", `✓ Email ${seq.id} : ${email.subject}`);
    } catch (err) {
      if (err instanceof Error && err.name === "BudgetBlockedError") throw err;
      await ctx.log("error", `Échec email : ${String(err).slice(0, 120)}`);
    }
  }

  return { itemsProduced: produced, summary: `${produced} email(s) à valider` };
}
