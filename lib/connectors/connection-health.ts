import { createAdminClient } from "@/lib/supabase/admin";
import { connectorLookupIds } from "@/lib/connectors/resolve-id";

export interface ConnectorHealthIssue {
  connectorId: string;
  code: "not_connected" | "expired" | "no_token";
  message: string;
}

interface ConnectionRow {
  connector_id: string;
  status: string;
  expires_at: string | null;
  access_token_enc: string | null;
  composio_account_id: string | null;
  provider: string | null;
}

/**
 * Diagnostique la santé de chaque connecteur requis par un agent
 * avant de lancer le run. Retourne les problèmes trouvés.
 */
export async function checkConnectorHealth(
  userId: string,
  requiredConnectors: string[],
): Promise<ConnectorHealthIssue[]> {
  if (requiredConnectors.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const issues: ConnectorHealthIssue[] = [];

  const { data: userConnections } = await admin
    .from("user_connections")
    .select("connector_id, status, expires_at, access_token_enc, composio_account_id, provider")
    .eq("owner_id", userId);

  const connections = (userConnections ?? []) as ConnectionRow[];

  for (const connectorId of requiredConnectors) {
    const lookupIds = connectorLookupIds(connectorId);
    const matching = connections.filter((c) =>
      lookupIds.includes(c.connector_id),
    );

    if (matching.length === 0) {
      issues.push({
        connectorId,
        code: "not_connected",
        message: `${connectorId} n'est pas connecté. Liez votre compte dans Connexions puis relancez.`,
      });
      continue;
    }

    const connected = matching.find((c) => c.status === "connected");
    if (!connected) {
      const expired = matching.find((c) => c.status === "expired");
      if (expired) {
        issues.push({
          connectorId,
          code: "expired",
          message: `Le token ${connectorId} a expiré. Reconnectez votre compte dans Connexions.`,
        });
      } else {
        issues.push({
          connectorId,
          code: "not_connected",
          message: `${connectorId} n'est pas connecté correctement. Reconnectez-le.`,
        });
      }
      continue;
    }

    const isComposio = connected.provider === "composio";
    if (!isComposio && !connected.access_token_enc && !connected.composio_account_id) {
      issues.push({
        connectorId,
        code: "no_token",
        message: `${connectorId} est connecté mais le token est absent. Reconnectez votre compte.`,
      });
      continue;
    }

    if (connected.expires_at && new Date(connected.expires_at) < new Date()) {
      issues.push({
        connectorId,
        code: "expired",
        message: `Le token ${connectorId} a expiré. Reconnectez votre compte.`,
      });
    }
  }

  return issues;
}
