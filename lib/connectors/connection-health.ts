import { createAdminClient } from "@/lib/supabase/admin";
import { connectorLookupIds } from "@/lib/connectors/resolve-id";
import {
  CONNECTORS_REQUIRING_EMAIL,
  missingRequiredScopes,
} from "@/lib/connectors/required-scopes";
import { CONNECTORS } from "@/lib/connectors/registry";

export interface ConnectorHealthIssue {
  connectorId: string;
  code:
    | "not_connected"
    | "expired"
    | "no_token"
    | "insufficient_scopes"
    | "no_account_identity";
  message: string;
}

export interface ConnectorAccountSummary {
  connectorId: string;
  label: string;
  accountEmail?: string | null;
  accountName?: string | null;
  workspaceName?: string | null;
  scopes?: string[];
}

interface ConnectionRow {
  connector_id: string;
  status: string;
  expires_at: string | null;
  access_token_enc: string | null;
  composio_account_id: string | null;
  provider: string | null;
  scopes: string[] | null;
  account_email: string | null;
  account_name: string | null;
  workspace_name: string | null;
}

function connectorLabel(connectorId: string): string {
  return CONNECTORS.find((c) => c.id === connectorId)?.label ?? connectorId;
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
    .select(
      "connector_id, status, expires_at, access_token_enc, composio_account_id, provider, scopes, account_email, account_name, workspace_name",
    )
    .eq("owner_id", userId);

  const connections = (userConnections ?? []) as ConnectionRow[];

  for (const connectorId of requiredConnectors) {
    const label = connectorLabel(connectorId);
    const lookupIds = connectorLookupIds(connectorId);
    const matching = connections.filter((c) => lookupIds.includes(c.connector_id));

    if (matching.length === 0) {
      issues.push({
        connectorId,
        code: "not_connected",
        message: `${label} n'est pas connecté. Liez votre compte dans Connexions puis relancez.`,
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
          message: `Le token ${label} a expiré. Reconnectez votre compte dans Connexions.`,
        });
      } else {
        issues.push({
          connectorId,
          code: "not_connected",
          message: `${label} n'est pas connecté correctement. Reconnectez-le.`,
        });
      }
      continue;
    }

    const isComposio = connected.provider === "composio";
    if (!isComposio && !connected.access_token_enc && !connected.composio_account_id) {
      issues.push({
        connectorId,
        code: "no_token",
        message: `${label} est connecté mais le token est absent. Reconnectez votre compte.`,
      });
      continue;
    }

    if (connected.expires_at && new Date(connected.expires_at) < new Date()) {
      issues.push({
        connectorId,
        code: "expired",
        message: `Le token ${label} a expiré. Reconnectez votre compte.`,
      });
      continue;
    }

    const grantedScopes = connected.scopes ?? [];
    const missingScopes = missingRequiredScopes(grantedScopes, connectorId);
    if (!isComposio && missingScopes.length > 0) {
      issues.push({
        connectorId,
        code: "insufficient_scopes",
        message: `${label} est connecté mais il manque des permissions (${missingScopes.join(", ")}). Reconnectez ${label}.`,
      });
      continue;
    }

    if (!isComposio) {
      const needsEmail = CONNECTORS_REQUIRING_EMAIL.has(connectorId);
      const hasIdentity =
        Boolean(connected.account_email?.trim()) ||
        Boolean(connected.account_name?.trim()) ||
        Boolean(connected.workspace_name?.trim());

      if (needsEmail && !connected.account_email?.trim()) {
        issues.push({
          connectorId,
          code: "no_account_identity",
          message: `${label} est connecté mais aucun email de compte vérifiable. Reconnectez ${label}.`,
        });
        continue;
      }

      if (!needsEmail && !hasIdentity) {
        issues.push({
          connectorId,
          code: "no_account_identity",
          message: `${label} est connecté mais le compte utilisé n'est pas identifiable. Reconnectez ${label}.`,
        });
      }
    }
  }

  return issues;
}

export async function summarizeConnectorAccounts(
  userId: string,
  requiredConnectors: string[],
): Promise<ConnectorAccountSummary[]> {
  if (requiredConnectors.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: userConnections } = await admin
    .from("user_connections")
    .select(
      "connector_id, status, scopes, account_email, account_name, workspace_name",
    )
    .eq("owner_id", userId)
    .eq("status", "connected");

  const connections = (userConnections ?? []) as ConnectionRow[];
  const summaries: ConnectorAccountSummary[] = [];

  for (const connectorId of requiredConnectors) {
    const lookupIds = connectorLookupIds(connectorId);
    const connected = connections.find((c) => lookupIds.includes(c.connector_id));
    if (!connected) continue;

    summaries.push({
      connectorId,
      label: connectorLabel(connectorId),
      accountEmail: connected.account_email,
      accountName: connected.account_name,
      workspaceName: connected.workspace_name,
      scopes: connected.scopes ?? [],
    });
  }

  return summaries;
}
