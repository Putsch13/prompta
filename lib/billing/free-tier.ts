/**
 * Bride free-tier : règles communes aux runs prompt ET agent quand
 * l'exécution passe sur le quota gratuit (usedFreeQuota).
 *
 * Fonctions pures (aucun accès DB/env) — testées dans
 * tests/unit/free-tier-billing.test.ts.
 */

import type { AgentManifest, BaseAgentStep } from "@/lib/agent/schema";
import { FREE_TIER_MODEL } from "./credits";

export type PlatformRunBillingDecision = "credits" | "free_quota" | "insufficient_credits";

/**
 * Décision de facturation d'un run exécuté sur clés PLATEFORME.
 * L'entitlement (propriétaire, Pro, achat, abonnement) n'est volontairement
 * PAS un paramètre : il ne donne que l'ACCÈS au listing, jamais la gratuité
 * de l'exécution — même règle pour les prompts et les agents.
 */
export function decidePlatformRunBilling(params: {
  balanceCents: number;
  minCreditsCents: number;
  listingIsFree: boolean;
}): PlatformRunBillingDecision {
  if (params.balanceCents >= params.minCreditsCents) return "credits";
  if (params.listingIsFree) return "free_quota";
  return "insufficient_credits";
}

function clampBaseStep(step: BaseAgentStep): BaseAgentStep {
  switch (step.type) {
    case "llm":
      return { ...step, model: FREE_TIER_MODEL };
    case "browser":
      // model optionnel (défaut : modèle de la mission) — forcé aussi, la
      // boucle de pilotage est une suite d'appels LLM sur clés plateforme.
      return { ...step, model: FREE_TIER_MODEL };
    case "action": {
      if (!step.aiFills || Object.keys(step.aiFills).length === 0) return step;
      const aiFills = Object.fromEntries(
        Object.entries(step.aiFills).map(([key, fill]) => [key, { ...fill, model: FREE_TIER_MODEL }]),
      );
      return { ...step, aiFills };
    }
    default:
      return step;
  }
}

/**
 * Force le modèle free-tier sur TOUS les appels LLM d'un manifeste (étapes
 * llm, branches parallel, remplissages IA, pilotage navigateur). Ne mute pas
 * le manifeste d'origine. Le plafond de tokens PAR APPEL est appliqué par
 * l'orchestrateur (llmMaxTokensCap) : poser FREE_RUN_MAX_TOKENS dans
 * limits.max_tokens serait écrasé par le plancher runtime de runAgent.
 */
export function applyFreeTierLimits(manifest: AgentManifest): AgentManifest {
  return {
    ...manifest,
    steps: manifest.steps.map((step) =>
      step.type === "parallel"
        ? {
            ...step,
            branches: step.branches.map((branch) => ({
              ...branch,
              steps: branch.steps.map(clampBaseStep),
            })),
          }
        : clampBaseStep(step),
    ),
  };
}
