import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { connectionMatchesConnector, connectorLookupIds } from "@/lib/connectors/resolve-id";

export interface ConnectionStatus {
  connectorId: string;
  status: "connected" | "disconnected" | "expired";
  /**
   * Vérité UNIQUE côté UI : la connexion peut servir un run maintenant.
   * `connected`, ou `expired` avec refresh token (ravivée au lancement).
   * Le masque de run / la page Connexions doivent lire CE champ, pas status.
   */
  usable: boolean;
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

interface ResolvableRow {
  connector_id: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  status: string;
  expires_at: string | null;
  provider: string | null;
  composio_account_id: string | null;
}

/**
 * Résout la connexion utilisable pour un connecteur.
 *
 * MÊME prédicat de matching que `checkConnectorHealth` (connectionMatchesConnector) :
 * une connexion vue « connectée » par la porte de santé est GARANTIE trouvable ici
 * (avant : la santé matchait en canonique large, la résolution en ids exacts —
 * d'où des runs refusant une auth pourtant affichée verte).
 *
 * Un statut « expired » n'est PAS éliminatoire : si un refresh token existe on le
 * tente (et on repasse la ligne en « connected » en cas de succès). Avant, une
 * ligne marquée expired ne retentait plus jamais son refresh token valide.
 */
export async function getUserConnection(
  userId: string,
  connectorId: string
): Promise<ResolvedConnection | null> {
  const { data } = await db()
    .from("user_connections")
    .select(
      "connector_id, access_token_enc, refresh_token_enc, status, expires_at, provider, composio_account_id"
    )
    .eq("owner_id", userId)
    .in("status", ["connected", "expired"]);

  const rows = ((data ?? []) as ResolvableRow[])
    .filter((r) => connectionMatchesConnector(r.connector_id, connectorId))
    // « connected » d'abord ; « expired » ensuite (tentative de refresh).
    .sort((a, b) => (a.status === "connected" ? 0 : 1) - (b.status === "connected" ? 0 : 1));

  for (const row of rows) {
    const conn = await resolveConnectionRow(userId, row);
    if (conn) return conn;
  }
  return null;
}

export async function isConnectorConnected(userId: string, connectorId: string): Promise<boolean> {
  return (await getUserConnection(userId, connectorId)) !== null;
}

async function resolveConnectionRow(
  userId: string,
  row: ResolvableRow
): Promise<ResolvedConnection | null> {
  if (row.provider === "composio") {
    return row.composio_account_id
      ? { accessToken: row.composio_account_id, provider: "composio" }
      : null;
  }

  if (!row.access_token_enc) return null;

  const expired =
    row.status === "expired" ||
    (row.expires_at != null && new Date(row.expires_at) < new Date());

  if (expired) {
    // Tente le refresh avant d'abandonner (tokens Google : durée de vie 1 h).
    if (row.refresh_token_enc) {
      const refreshed = await tryRefreshToken(
        userId,
        row.connector_id,
        decryptSecret(row.refresh_token_enc)
      );
      if (refreshed) return refreshed;
    }
    if (row.status !== "expired") {
      await db()
        .from("user_connections")
        .update({ status: "expired" })
        .eq("owner_id", userId)
        .eq("connector_id", row.connector_id);
    }
    return null;
  }

  return {
    accessToken: decryptSecret(row.access_token_enc),
    refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : undefined,
    provider: "native",
  };
}

const GOOGLE_REFRESH = { url: "https://oauth2.googleapis.com/token", clientIdEnv: "GOOGLE_CLIENT_ID", clientSecretEnv: "GOOGLE_CLIENT_SECRET" };

const REFRESH_CONFIGS: Record<string, { url: string; clientIdEnv: string; clientSecretEnv: string }> = {
  // Tous les connecteurs Google partagent le même endpoint de refresh : sans
  // entrée ici, leurs tokens (durée de vie ~1 h) expirent sans rafraîchissement
  // et les runs échouent alors que refresh_token_enc est présent.
  gmail: GOOGLE_REFRESH,
  google_sheets: GOOGLE_REFRESH,
  google_docs: GOOGLE_REFRESH,
  google_drive: GOOGLE_REFRESH,
  google_calendar: GOOGLE_REFRESH,
  slack: { url: "https://slack.com/api/oauth.v2.access", clientIdEnv: "SLACK_CLIENT_ID", clientSecretEnv: "SLACK_CLIENT_SECRET" },
  canva: { url: "https://api.canva.com/rest/v1/oauth/token", clientIdEnv: "CANVA_CLIENT_ID", clientSecretEnv: "CANVA_CLIENT_SECRET" },
};

async function tryRefreshToken(
  userId: string,
  connectorId: string,
  refreshToken: string
): Promise<ResolvedConnection | null> {
  // Lookup tolérant aux variantes d'id (google_sheets / googlesheets / …).
  const config =
    REFRESH_CONFIGS[connectorId] ??
    Object.entries(REFRESH_CONFIGS).find(([key]) =>
      connectionMatchesConnector(connectorId, key)
    )?.[1];
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
      "connector_id, status, scopes, expires_at, provider, account_email, account_name, workspace_name, last_checked_at, refresh_token_enc",
    )
    .eq("owner_id", userId);

  return (data ?? []).map(
    (r) => ({
      connectorId: r.connector_id,
      status: r.status as ConnectionStatus["status"],
      usable:
        r.status === "connected" ||
        (r.status === "expired" && Boolean(r.refresh_token_enc)),
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
