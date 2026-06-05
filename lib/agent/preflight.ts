import type { AgentManifest } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { runnerRequiredConnectors } from "@/lib/agent/run-connectors";

export interface PreflightIssue {
  code: "missing_key" | "missing_connector";
  message: string;
}

/** Vérifie clés BYOK et connecteurs requis avant de lancer un agent. */
export async function validateAgentPreflight(
  manifest: AgentManifest,
  apiKeys: Record<string, string>,
  userId: string,
  options?: { dryRun?: boolean; creatorId?: string }
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const dryRun = options?.dryRun ?? false;

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

  if (!dryRun) {
    const { listUserConnections } = await import("@/lib/connections");
    const { connectionMatchesConnector } = await import("@/lib/connectors/resolve-id");
    const connections = await listUserConnections(userId);
    const connected = connections.filter((c) => c.status === "connected");
    const requiredConnectors = runnerRequiredConnectors(manifest, {
      userId,
      creatorId: options?.creatorId,
    });

    for (const connectorId of requiredConnectors) {
      const ok = connected.some((c) => connectionMatchesConnector(c.connectorId, connectorId));
      if (!ok) {
        issues.push({
          code: "missing_connector",
          message: `Connectez ${connectorId} pour lancer — liez votre compte dans Connexions.`,
        });
      }
    }

    for (const step of manifest.steps) {
      if (step.type === "action" && step.connector === "gmail" && step.action === "send") {
        const gmailOk = connected.some((c) => connectionMatchesConnector(c.connectorId, "gmail"));
        if (!gmailOk) {
          issues.push({
            code: "missing_connector",
            message: "Connectez la boîte d'envoi Gmail pour lancer cet agent.",
          });
        }
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
