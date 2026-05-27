import type { AgentManifest } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";

export interface PreflightIssue {
  code: "missing_key" | "missing_connector";
  message: string;
}

/** Vérifie clés BYOK et connecteurs requis avant de lancer un agent. */
export async function validateAgentPreflight(
  manifest: AgentManifest,
  apiKeys: Record<string, string>,
  userId: string,
  options?: { dryRun?: boolean }
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const dryRun = options?.dryRun ?? false;

  for (const secret of manifest.secrets) {
    if (!apiKeys[secret]) {
      issues.push({
        code: "missing_key",
        message: `Clé ${secret} manquante — configurez-la dans Connexions.`,
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

  if (!dryRun && manifest.connectors.length > 0) {
    const { listUserConnections } = await import("@/lib/connections");
    const { dedupeConnectors, connectionMatchesConnector } = await import(
      "@/lib/connectors/resolve-id"
    );
    const connections = await listUserConnections(userId);
    const connected = connections.filter((c) => c.status === "connected");

    for (const connectorId of dedupeConnectors(manifest.connectors)) {
      const ok = connected.some((c) => connectionMatchesConnector(c.connectorId, connectorId));
      if (!ok) {
        issues.push({
          code: "missing_connector",
          message: `Connecteur ${connectorId} non connecté — liez-le dans Connexions puis actualisez.`,
        });
      }
    }
  }

  const seen = new Set<string>();
  return issues.filter((i) => {
    if (seen.has(i.message)) return false;
    seen.add(i.message);
    return true;
  });
}
