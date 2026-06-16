import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { connectorLookupIds } from "@/lib/connectors/resolve-id";

export interface ConnectionStatus {
  connectorId: string;
  status: "connected" | "disconnected" | "expired";
  scopes?: string[];
  expiresAt?: string | null;
  provider?: "native" | "composio";
  accountEmail?: string | null;
  accountName?: string | null;
  workspaceName?: string | null;
  lastCheckedAt?: string | null;
}

function db() {
  return createAdminClient();
}

export interface ResolvedConnection {
  accessToken: string;
  refreshToken?: string;
  /** Origine de la connexion — détermine le chemin d'exécution (natif vs Composio). */
  provider?: "native" | "composio";
}

export async function getUserConnection(
  userId: string,
  connectorId: string
): Promise<ResolvedConnection | null> {
  for (const id of connectorLookupIds(connectorId)) {
    const conn = await getUserConnectionDirect(userId, id);
    if (conn) return conn;
  }
  return null;
}

export async function isConnectorConnected(userId: string, connectorId: string): Promise<boolean> {
  return (await getUserConnection(userId, connectorId)) !== null;
}

async function getUserConnectionDirect(
  userId: string,
  connectorId: string
): Promise<ResolvedConnection | null> {
  const { data } = await db()
    .from("user_connections")
    .select("access_token_enc, refresh_token_enc, status, expires_at, provider, composio_account_id")
    .eq("owner_id", userId)
    .eq("connector_id", connectorId)
    .eq("status", "connected")
    .maybeSingle();

  if (data?.provider === "composio") {
    return data.composio_account_id
      ? { accessToken: data.composio_account_id, provider: "composio" }
      : null;
  }

  if (!data?.access_token_enc) return null;

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Try refreshing the token before giving up
    if (data.refresh_token_enc) {
      const refreshed = await tryRefreshToken(
        userId,
        connectorId,
        decryptSecret(data.refresh_token_enc)
      );
      if (refreshed) return refreshed;
    }
    await db()
      .from("user_connections")
      .update({ status: "expired" })
      .eq("owner_id", userId)
      .eq("connector_id", connectorId);
    return null;
  }

  return {
    accessToken: decryptSecret(data.access_token_enc),
    refreshToken: data.refresh_token_enc ? decryptSecret(data.refresh_token_enc) : undefined,
    provider: "native",
  };
}

const REFRESH_CONFIGS: Record<string, { url: string; clientIdEnv: string; clientSecretEnv: string }> = {
  gmail: { url: "https://oauth2.googleapis.com/token", clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  google_sheets: { url: "https://oauth2.googleapis.com/token", clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET" },
  slack: { url: "https://slack.com/api/oauth.v2.access", clientIdEnv: "SLACK_CLIENT_ID", clientSecretEnv: "SLACK_CLIENT_SECRET" },
  canva: { url: "https://api.canva.com/rest/v1/oauth/token", clientIdEnv: "CANVA_CLIENT_ID", clientSecretEnv: "CANVA_CLIENT_SECRET" },
};

async function tryRefreshToken(
  userId: string,
  connectorId: string,
  refreshToken: string
): Promise<ResolvedConnection | null> {
  const config = REFRESH_CONFIGS[connectorId];
  if (!config) return null;

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) return null;

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const newAccessToken = data.access_token;
    if (!newAccessToken) return null;

    const newRefreshToken = data.refresh_token ?? refreshToken;
    const expiresIn = data.expires_in;

    await saveUserConnection(userId, connectorId, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken, provider: "native" };
  } catch {
    return null;
  }
}

export async function saveComposioConnection(
  userId: string,
  toolkitSlug: string,
  composioAccountId: string,
  profile?: {
    accountEmail?: string | null;
    accountName?: string | null;
    workspaceName?: string | null;
  },
): Promise<void> {
  const ids = connectorLookupIds(toolkitSlug);
  const now = new Date().toISOString();
  for (const connectorId of ids) {
    await db().from("user_connections").upsert(
      {
        owner_id: userId,
        connector_id: connectorId,
        provider: "composio",
        composio_account_id: composioAccountId,
        status: "connected",
        access_token_enc: null,
        refresh_token_enc: null,
        account_email: profile?.accountEmail ?? null,
        account_name: profile?.accountName ?? null,
        workspace_name: profile?.workspaceName ?? null,
        last_checked_at: now,
        updated_at: now,
      },
      { onConflict: "owner_id,connector_id" }
    );
  }
}

export async function isComposioToolkitConnected(
  userId: string,
  toolkitSlug: string
): Promise<boolean> {
  const { data } = await db()
    .from("user_connections")
    .select("status, provider")
    .eq("owner_id", userId)
    .eq("connector_id", toolkitSlug)
    .eq("provider", "composio")
    .maybeSingle();
  return data?.status === "connected";
}

export async function saveUserConnectionApiKey(
  userId: string,
  connectorId: string,
  apiKey: string
): Promise<void> {
  await db().from("user_connections").upsert(
    {
      owner_id: userId,
      connector_id: connectorId,
      provider: "native",
      access_token_enc: encryptSecret(apiKey),
      status: "connected",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,connector_id" }
  );
}

export async function saveUserConnection(
  userId: string,
  connectorId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    scopes?: string[];
    accountEmail?: string | null;
    accountName?: string | null;
    workspaceName?: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await db().from("user_connections").upsert(
    {
      owner_id: userId,
      connector_id: connectorId,
      access_token_enc: encryptSecret(tokens.accessToken),
      refresh_token_enc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      status: "connected",
      scopes: tokens.scopes ?? [],
      expires_at: tokens.expiresAt?.toISOString() ?? null,
      account_email: tokens.accountEmail ?? null,
      account_name: tokens.accountName ?? null,
      workspace_name: tokens.workspaceName ?? null,
      last_checked_at: now,
      updated_at: now,
    },
    { onConflict: "owner_id,connector_id" }
  );
}

export async function listUserConnections(userId: string): Promise<ConnectionStatus[]> {
  const { data } = await db()
    .from("user_connections")
    .select(
      "connector_id, status, scopes, expires_at, provider, account_email, account_name, workspace_name, last_checked_at",
    )
    .eq("owner_id", userId);

  return (data ?? []).map(
    (r) => ({
      connectorId: r.connector_id,
      status: r.status as ConnectionStatus["status"],
      scopes: r.scopes ?? [],
      expiresAt: r.expires_at,
      provider: (r.provider as ConnectionStatus["provider"]) ?? "native",
      accountEmail: r.account_email ?? null,
      accountName: r.account_name ?? null,
      workspaceName: r.workspace_name ?? null,
      lastCheckedAt: r.last_checked_at ?? null,
    })
  );
}

export async function revokeConnection(userId: string, connectorId: string): Promise<void> {
  await db()
    .from("user_connections")
    .update({ status: "disconnected", access_token_enc: null, refresh_token_enc: null })
    .eq("owner_id", userId)
    .eq("connector_id", connectorId);
}
