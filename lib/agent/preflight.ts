import type { AgentManifest } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";

export interface PreflightIssue {
  code: "missing_key" | "missing_connector";
  message: string;
}

/**
 * Vérifie les clés BYOK requises avant de lancer un agent.
 *
 * Source de vérité unique pour les CLÉS uniquement. La disponibilité des
 * CONNECTEURS est gérée par `checkConnectorHealth` (lib/connectors/connection-health.ts) —
 * seule autorité sur « ce connecteur est-il utilisable ? » — afin d'éviter la
 * logique de connexion dupliquée qui produisait les faux « pas connecté ».
 */
export async function validateAgentPreflight(
  manifest: AgentManifest,
  apiKeys: Record<string, string>,
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];

  for (const secret of manifest.secrets) {
    if (!apiKeys[secret]) {
      issues.push({
        code: "missing_key",
        message: `Ajoutez votre clé ${secret} pour lancer — configurez-la dans Connexions.`,
      });
    }
  }

  for (const step of manifest.steps) {
    if (step.type === "llm") {
      const { provider } = resolveModelOrDefault(step.model);
      if (!apiKeys[provider] && !manifest.secrets.includes(provider as KeyProvider)) {
        issues.push({
          code: "missing_key",
          message: `Clé ${provider} requise pour le modèle ${step.model}.`,
        });
      }
    }
    if (step.type === "tool" && step.tool === "web_search" && !apiKeys.serper) {
      issues.push({
        code: "missing_key",
        message: "Clé Serper requise pour la recherche web.",
      });
    }
  }

  const seen = new Set<string>();
  return issues.filter((i) => {
    if (seen.has(i.message)) return false;
    seen.add(i.message);
    return true;
  });
}
