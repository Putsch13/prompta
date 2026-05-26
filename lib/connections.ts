import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export interface ConnectionStatus {
  connectorId: string;
  status: "connected" | "disconnected" | "expired";
  scopes?: string[];
  expiresAt?: string | null;
  provider?: "native" | "composio";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient();
}

export async function getUserConnection(
  userId: string,
  connectorId: string
): Promise<{ accessToken: string; refreshToken?: string } | null> {
  const { data } = await db()
    .from("user_connections")
    .select("access_token_enc, refresh_token_enc, status, expires_at, provider, composio_account_id")
    .eq("owner_id", userId)
    .eq("connector_id", connectorId)
    .eq("status", "connected")
    .maybeSingle();

  if (data?.provider === "composio") {
    return data.composio_account_id ? { accessToken: data.composio_account_id } : null;
  }

  if (!data?.access_token_enc) return null;

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
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
  };
}

export async function saveComposioConnection(
  userId: string,
  toolkitSlug: string,
  composioAccountId: string
): Promise<void> {
  await db().from("user_connections").upsert(
    {
      owner_id: userId,
      connector_id: toolkitSlug,
      provider: "composio",
      composio_account_id: composioAccountId,
      status: "connected",
      access_token_enc: null,
      refresh_token_enc: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,connector_id" }
  );
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
  tokens: { accessToken: string; refreshToken?: string; expiresAt?: Date; scopes?: string[] }
): Promise<void> {
  await db().from("user_connections").upsert(
    {
      owner_id: userId,
      connector_id: connectorId,
      access_token_enc: encryptSecret(tokens.accessToken),
      refresh_token_enc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      status: "connected",
      scopes: tokens.scopes ?? [],
      expires_at: tokens.expiresAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,connector_id" }
  );
}

export async function listUserConnections(userId: string): Promise<ConnectionStatus[]> {
  const { data } = await db()
    .from("user_connections")
    .select("connector_id, status, scopes, expires_at, provider")
    .eq("owner_id", userId);

  return (data ?? []).map(
    (r: {
      connector_id: string;
      status: string;
      scopes: string[];
      expires_at: string | null;
      provider?: string;
    }) => ({
      connectorId: r.connector_id,
      status: r.status as ConnectionStatus["status"],
      scopes: r.scopes ?? [],
      expiresAt: r.expires_at,
      provider: (r.provider as ConnectionStatus["provider"]) ?? "native",
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
