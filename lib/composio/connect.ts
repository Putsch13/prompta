import { saveComposioConnection, isComposioToolkitConnected, getUserConnection } from "@/lib/connections";
import { getComposioClient, toComposioToolkitSlug } from "./client";
import { profileFromComposioAccount } from "@/lib/connectors/fetch-account-profile";

/**
 * ⚠️ NE PAS forcer de scopes personnalisés sur l'auth « managed » de Composio.
 *
 * L'app OAuth de Composio est VÉRIFIÉE par Google pour un jeu de scopes
 * précis. Quand on injectait nos propres scopes (gmail.modify, drive
 * complet…), Google voyait une demande qui ne correspond pas à l'app
 * vérifiée et BLOQUAIT tout le consentement (« Cette application est
 * bloquée »). Les défauts managed de Composio couvrent leurs outils
 * (envoi Gmail, écriture Sheets…).
 */
async function getAuthConfigId(
  toolkitSlug: string,
  opts?: { reset?: boolean },
): Promise<string> {
  const composio = getComposioClient();

  const listed = await composio.authConfigs.list({ toolkit: toolkitSlug });
  const existing = listed.items?.[0]?.id;

  if (existing && opts?.reset) {
    // Reconnexion forcée : la config peut avoir été « empoisonnée » par
    // l'ancien forçage de scopes → on repart d'une config managed propre.
    try {
      await composio.authConfigs.delete(existing);
      console.info(`[composio] auth config ${toolkitSlug} réinitialisée (reset)`);
    } catch (err) {
      console.warn(
        `[composio] reset auth config ${toolkitSlug} impossible, réutilisation:`,
        err instanceof Error ? err.message : err,
      );
      return existing;
    }
  } else if (existing) {
    return existing;
  }

  const created = await composio.authConfigs.create(toolkitSlug, {
    type: "use_composio_managed_auth",
    name: `Prompta — ${toolkitSlug}`,
  });
  return created.id;
}

export type ComposioAuthStart =
  | { kind: "redirect"; url: string }
  /** Toolkit sans authentification : rien à connecter, utilisable direct. */
  | { kind: "no_auth_required" };

export async function startComposioAuth(
  userId: string,
  connectorId: string,
  callbackUrl: string,
  opts?: { reset?: boolean },
): Promise<ComposioAuthStart> {
  const toolkitSlug = toComposioToolkitSlug(connectorId);
  const composio = getComposioClient();

  try {
    const authConfigId = await getAuthConfigId(toolkitSlug, opts);

    const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId, {
      callbackUrl,
      allowMultiple: true,
    });

    const redirectUrl = connectionRequest.redirectUrl;
    if (!redirectUrl) {
      throw new Error(`Composio : pas de redirect URL pour ${toolkitSlug}`);
    }
    return { kind: "redirect", url: redirectUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Toolkit SANS auth (ex. « composio », outils utilitaires) : Composio
    // refuse la création d'auth config car il n'y a rien à autoriser. On
    // marque le connecteur utilisable directement.
    if (/Auth_Config_NoAuthApp|does not require authentication/i.test(msg)) {
      await saveComposioConnection(userId, toolkitSlug, "no_auth");
      return { kind: "no_auth_required" };
    }
    // Toolkit sans credentials gérés par Composio (ex. « canvas ») : il
    // faudrait fournir ses propres client_id/secret — pas supporté à ce jour.
    if (/Auth_Config_DefaultAuthConfigNotFound|does not have managed credentials/i.test(msg)) {
      throw new Error(
        `« ${toolkitSlug} » n'a pas d'authentification gérée par Composio — il faudrait vos propres identifiants OAuth développeur. Cette app n'est pas connectable pour l'instant, cherchez une alternative dans le catalogue.`,
      );
    }
    throw err;
  }
}

export async function handleComposioCallback(
  userId: string,
  toolkitSlug: string,
  connectedAccountId: string,
  status: string
): Promise<void> {
  if (status !== "success") {
    throw new Error("Authentification Composio échouée");
  }
  await saveComposioConnection(userId, toolkitSlug, connectedAccountId);
}

export async function syncComposioConnections(userId: string): Promise<number> {
  const composio = getComposioClient();
  const accounts = await composio.connectedAccounts.list({
    userIds: [userId],
    statuses: ["ACTIVE"],
  });
  let synced = 0;
  for (const account of accounts.items ?? []) {
    const slug = account.toolkit?.slug;
    if (!slug || !account.id) continue;
    let profile = profileFromComposioAccount(account);
    if (!profile.accountEmail && !profile.accountName && !profile.workspaceName) {
      try {
        const full = await composio.connectedAccounts.get(account.id);
        profile = profileFromComposioAccount(full);
      } catch {
        // best-effort
      }
    }
    await saveComposioConnection(userId, slug, account.id, profile);
    synced++;
  }
  return synced;
}

export async function checkComposioConnection(
  userId: string,
  connectorId: string
): Promise<boolean> {
  const toolkitSlug = toComposioToolkitSlug(connectorId);
  if (await isComposioToolkitConnected(userId, toolkitSlug)) return true;

  const composio = getComposioClient();
  const accounts = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: [toolkitSlug],
    statuses: ["ACTIVE"],
  });

  const items = accounts.items ?? [];
  if (items.length === 0) return false;

  const stored = await getUserConnection(userId, toolkitSlug);
  const storedId = stored?.accessToken;
  const preferred =
    (storedId ? items.find((a) => a.id === storedId) : undefined) ??
    items[items.length - 1];

  if (preferred?.id) {
    let profile = profileFromComposioAccount(preferred);
    try {
      const full = await composio.connectedAccounts.get(preferred.id);
      profile = profileFromComposioAccount(full);
    } catch {
      // best-effort
    }
    await saveComposioConnection(userId, toolkitSlug, preferred.id, profile);
    return true;
  }
  return false;
}
