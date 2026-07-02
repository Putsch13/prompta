import { saveComposioConnection, isComposioToolkitConnected, getUserConnection } from "@/lib/connections";
import { getComposioClient, toComposioToolkitSlug } from "./client";
import { profileFromComposioAccount } from "@/lib/connectors/fetch-account-profile";

/**
 * Scopes OAuth requis par toolkit (auth Composio « managed »).
 *
 * Sans ces scopes, Composio crée l'auth config avec un accès minimal (souvent
 * `drive.file` côté Google = uniquement les fichiers créés par l'app), ce qui
 * provoque un 403 « autorisation manquante » à la lecture d'une feuille
 * existante. On les fixe explicitement pour que la connexion demande le bon
 * niveau d'accès dès le consentement OAuth.
 */
const TOOLKIT_SCOPES: Record<string, string[]> = {
  // spreadsheets : lecture/écriture des cellules. drive (complet) : nécessaire
  // pour créer/déplacer une feuille existante et la retrouver dans le Drive.
  googlesheets: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
  gmail: [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
  // drive (complet) : lecture ET écriture de fichiers (create_file_from_text…).
  googledrive: ["https://www.googleapis.com/auth/drive"],
  // documents : créer/éditer un Doc. drive : créer le fichier dans le Drive.
  googledocs: [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
  ],
  googlecalendar: ["https://www.googleapis.com/auth/calendar"],
};

function scopesFor(toolkitSlug: string): string[] | undefined {
  return TOOLKIT_SCOPES[toolkitSlug];
}

async function getAuthConfigId(toolkitSlug: string): Promise<string> {
  const composio = getComposioClient();
  const scopes = scopesFor(toolkitSlug);

  const listed = await composio.authConfigs.list({ toolkit: toolkitSlug });
  const existing = listed.items?.[0]?.id;
  if (existing) {
    // Best-effort : aligne les scopes d'une config existante (créée avant ce
    // correctif) pour qu'une reconnexion obtienne le bon niveau d'accès.
    if (scopes) {
      try {
        await composio.authConfigs.update(existing, {
          type: "default",
          scopes: scopes.join(" "),
        });
      } catch (err) {
        console.warn(
          `[composio] maj scopes auth config ${toolkitSlug} échouée (non bloquant):`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return existing;
  }

  try {
    const created = await composio.authConfigs.create(toolkitSlug, {
      type: "use_composio_managed_auth",
      name: `Prompta — ${toolkitSlug}`,
      ...(scopes ? { credentials: { scopes } } : {}),
    });
    return created.id;
  } catch (err) {
    // Si les scopes ne sont pas acceptés par l'app managed, on retombe sur une
    // création sans scope plutôt que de bloquer toute connexion.
    if (scopes) {
      console.warn(
        `[composio] création auth config ${toolkitSlug} avec scopes échouée, retry sans scopes:`,
        err instanceof Error ? err.message : err,
      );
      const created = await composio.authConfigs.create(toolkitSlug, {
        type: "use_composio_managed_auth",
        name: `Prompta — ${toolkitSlug}`,
      });
      return created.id;
    }
    throw err;
  }
}

export type ComposioAuthStart =
  | { kind: "redirect"; url: string }
  /** Toolkit sans authentification : rien à connecter, utilisable direct. */
  | { kind: "no_auth_required" };

export async function startComposioAuth(
  userId: string,
  connectorId: string,
  callbackUrl: string
): Promise<ComposioAuthStart> {
  const toolkitSlug = toComposioToolkitSlug(connectorId);
  const composio = getComposioClient();

  try {
    const authConfigId = await getAuthConfigId(toolkitSlug);

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
