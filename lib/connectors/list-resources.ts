import { getUserConnection, listUserConnections } from "@/lib/connections";
import { isComposioEnabled, toComposioToolkitSlug } from "@/lib/composio/client";
import { connectionMatchesConnector } from "./resolve-id";
import { missingRequiredScopes } from "./required-scopes";
import { getResourceType } from "./resource-types";
import type { ExecuteContext } from "./types";

export interface ResourceListItem {
  id: string;
  label: string;
  subLabel?: string;
  parentId?: string;
}

export interface ListResourcesResult {
  items: ResourceListItem[];
  nextCursor?: string;
}

const cache = new Map<string, { at: number; data: ListResourcesResult }>();
const CACHE_MS = 30_000;

function cacheKey(userId: string, connectorId: string, resourceType: string, parent?: string, q?: string) {
  return `${userId}:${connectorId}:${resourceType}:${parent ?? ""}:${q ?? ""}`;
}

async function fetchGoogleSpreadsheets(token: string, q?: string): Promise<ResourceListItem[]> {
  const query = q
    ? `mimeType='application/vnd.google-apps.spreadsheet' and name contains '${q.replace(/'/g, "\\'")}'`
    : "mimeType='application/vnd.google-apps.spreadsheet'";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) {
    throw new InsufficientScopesError("google_sheets");
  }
  if (!res.ok) throw new Error(`Drive list: ${res.status}`);
  const data = (await res.json()) as { files?: { id: string; name: string }[] };
  return (data.files ?? []).map((f) => ({ id: f.id, label: f.name }));
}

async function fetchSheetTabs(token: string, spreadsheetId: string): Promise<ResourceListItem[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets tabs: ${res.status}`);
  const data = (await res.json()) as { sheets?: { properties?: { title?: string; sheetId?: number } }[] };
  return (data.sheets ?? []).map((s) => ({
    id: s.properties?.title ?? "Sheet",
    label: s.properties?.title ?? "Sheet",
    parentId: spreadsheetId,
  }));
}

async function fetchGmailSendAs(token: string): Promise<ResourceListItem[]> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail sendAs: ${res.status}`);
  const data = (await res.json()) as {
    sendAs?: { sendAsEmail?: string; displayName?: string; isPrimary?: boolean }[];
  };
  return (data.sendAs ?? []).map((s) => ({
    id: s.sendAsEmail ?? "",
    label: s.displayName ? `${s.displayName} <${s.sendAsEmail}>` : (s.sendAsEmail ?? ""),
    subLabel: s.isPrimary ? "Principale" : undefined,
  }));
}

async function fetchSlackChannels(token: string, q?: string): Promise<ResourceListItem[]> {
  const res = await fetch(
    "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as {
    ok: boolean;
    channels?: { id: string; name: string; is_private?: boolean }[];
    error?: string;
  };
  if (!data.ok) throw new Error(`Slack: ${data.error ?? "list failed"}`);
  let items = (data.channels ?? []).map((c) => ({
    id: c.id,
    label: `#${c.name}`,
    subLabel: c.is_private ? "Privé" : "Public",
  }));
  if (q) {
    const lq = q.toLowerCase();
    items = items.filter((i) => i.label.toLowerCase().includes(lq));
  }
  return items;
}

async function listNativeResources(
  resourceType: string,
  ctx: ExecuteContext,
  parent?: string,
  q?: string,
): Promise<ListResourcesResult> {
  const token = ctx.accessToken;
  if (!token) throw new Error("Connexion requise");

  switch (resourceType) {
    case "google_sheets.spreadsheet":
      return { items: await fetchGoogleSpreadsheets(token, q) };
    case "google_sheets.tab":
      if (!parent) return { items: [] };
      return { items: await fetchSheetTabs(token, parent) };
    case "gmail.send_as":
      return { items: await fetchGmailSendAs(token) };
    case "slack.channel":
      return { items: await fetchSlackChannels(token, q) };
    default:
      return { items: [] };
  }
}

async function listComposioResources(
  resourceType: string,
  userId: string,
  connectorId: string,
  parent?: string,
  q?: string,
): Promise<ListResourcesResult> {
  if (resourceType.startsWith("google_sheets.")) {
    return listComposioGoogleSheetsResources(resourceType, userId, connectorId, parent, q);
  }

  const def = getResourceType(resourceType);
  if (!def?.listAction) return { items: [] };

  const { executeComposioTool } = await import("@/lib/composio/execute");
  try {
    const result = await executeComposioTool(def.listAction, userId, {}, {
      toolkitSlug: toComposioToolkitSlug(def.connectorId),
    });
    const parsed = JSON.parse(result.output || "{}") as {
      items?: ResourceListItem[];
      bases?: { id: string; name: string }[];
      tables?: { id: string; name: string }[];
    };
    if (parsed.items) return { items: parsed.items };
    if (parsed.bases) return { items: parsed.bases.map((b) => ({ id: b.id, label: b.name })) };
    if (parsed.tables) return { items: parsed.tables.map((t) => ({ id: t.id, label: t.name, parentId: parent })) };
    return { items: [] };
  } catch {
    return { items: [] };
  }
}

function parseComposioSpreadsheetOutput(output: string): ResourceListItem[] {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const nested = parsed.data as Record<string, unknown> | undefined;
    const candidates = [
      parsed.files,
      parsed.spreadsheets,
      parsed.items,
      nested?.files,
      nested?.spreadsheets,
      nested?.items,
    ];
    for (const raw of candidates) {
      if (!Array.isArray(raw)) continue;
      const items = raw
        .map((f: Record<string, string>) => ({
          id: f.id ?? f.spreadsheetId ?? f.spreadsheet_id ?? "",
          label: f.name ?? f.title ?? f.label ?? f.id ?? "",
        }))
        .filter((i) => i.id);
      if (items.length > 0) return items;
    }
  } catch {
    /* output non-JSON */
  }
  return [];
}

function parseComposioSheetTabs(output: string, spreadsheetId: string): ResourceListItem[] {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const nested = parsed.data as Record<string, unknown> | undefined;
    const sheets =
      (parsed.sheets as unknown[]) ??
      (nested?.sheets as unknown[]) ??
      [];
    return sheets.map((s) => {
      const props = (s as { properties?: { title?: string } }).properties;
      const title = props?.title ?? "Sheet";
      return { id: title, label: title, parentId: spreadsheetId };
    });
  } catch {
    return [];
  }
}

async function listComposioGoogleSheetsResources(
  resourceType: string,
  userId: string,
  connectorId: string,
  parent?: string,
  q?: string,
): Promise<ListResourcesResult> {
  const { executeComposioTool } = await import("@/lib/composio/execute");
  const toolkit = toComposioToolkitSlug(connectorId);

  if (resourceType === "google_sheets.spreadsheet") {
    const result = await executeComposioTool(
      "GOOGLESHEETS_SEARCH_SPREADSHEETS",
      userId,
      q ? { query: q } : {},
      { toolkitSlug: toolkit },
    );
    return { items: parseComposioSpreadsheetOutput(result.output) };
  }

  if (resourceType === "google_sheets.tab" && parent) {
    for (const action of ["GOOGLESHEETS_GET_SPREADSHEET_INFO", "GOOGLESHEETS_GET_SPREADSHEET"]) {
      try {
        const result = await executeComposioTool(
          action,
          userId,
          { spreadsheet_id: parent },
          { toolkitSlug: toolkit },
        );
        const items = parseComposioSheetTabs(result.output, parent);
        if (items.length > 0) return { items };
      } catch {
        /* essayer action suivante */
      }
    }
  }

  return { items: [] };
}

function assertGoogleSheetsScopes(
  connectorId: string,
  grantedScopes: string[] | undefined,
): void {
  if (!connectionMatchesConnector(connectorId, "google_sheets")) return;
  const missing = missingRequiredScopes(grantedScopes ?? [], "google_sheets");
  if (missing.length > 0) {
    throw new InsufficientScopesError("google_sheets");
  }
}

export class NeedsConnectionError extends Error {
  constructor(public connectorId: string) {
    super(`Connexion ${connectorId} requise`);
    this.name = "NeedsConnectionError";
  }
}

export class InsufficientScopesError extends Error {
  constructor(
    public connectorId: string,
    message = "Reconnectez Google Sheets pour autoriser la sélection de fichiers.",
  ) {
    super(message);
    this.name = "InsufficientScopesError";
  }
}

/**
 * P4.3 : Composio par défaut, natif en secours.
 *
 * Stratégie :
 *  1. Si Composio est activé ET l'utilisateur a une connexion Composio pour ce
 *     connecteur → on tente d'abord Composio (résultats riches, scoping uniforme).
 *  2. Si Composio échoue OU n'est pas applicable → on retombe sur le natif si
 *     `listVia === "native"`, sinon on propage l'erreur Composio.
 *  3. Les erreurs « besoin de connexion / scopes insuffisants » remontent telles
 *     quelles pour que l'UI puisse afficher un bouton « Reconnecter ».
 */
export async function listConnectorResources(opts: {
  userId: string;
  connectorId: string;
  resourceType: string;
  parent?: string;
  q?: string;
}): Promise<ListResourcesResult> {
  const { userId, connectorId, resourceType, parent, q } = opts;
  const ck = cacheKey(userId, connectorId, resourceType, parent, q);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const def = getResourceType(resourceType);
  if (!def) return { items: [] };

  const conn = await getUserConnection(userId, connectorId);
  if (!conn?.accessToken) throw new NeedsConnectionError(connectorId);

  const connections = await listUserConnections(userId);
  const status = connections.find(
    (c) => connectionMatchesConnector(c.connectorId, connectorId) && c.status === "connected",
  );

  const composioEnabled = isComposioEnabled();
  const userHasComposio = status?.provider === "composio";
  const composioCanList = composioEnabled && userHasComposio && !!def.listAction;

  const ctx: ExecuteContext = { userId, accessToken: conn.accessToken };
  let result: ListResourcesResult | null = null;

  if (composioCanList) {
    try {
      if (resourceType.startsWith("google_sheets.")) {
        result = await listComposioGoogleSheetsResources(resourceType, userId, connectorId, parent, q);
      } else {
        result = await listComposioResources(resourceType, userId, connectorId, parent, q);
      }
    } catch (err) {
      if (err instanceof NeedsConnectionError || err instanceof InsufficientScopesError) {
        throw err;
      }
      // Erreurs Composio non bloquantes → on retombera sur le natif si possible
      result = null;
    }
  }

  if ((!result || result.items.length === 0) && def.listVia === "native") {
    if (resourceType.startsWith("google_sheets.")) {
      assertGoogleSheetsScopes(connectorId, status?.scopes);
    }
    try {
      result = await listNativeResources(resourceType, ctx, parent, q);
    } catch (err) {
      if (err instanceof InsufficientScopesError) throw err;
      if (
        err instanceof Error &&
        resourceType.startsWith("google_sheets.") &&
        err.message.includes("403")
      ) {
        throw new InsufficientScopesError("google_sheets");
      }
      if (!result) throw err;
    }
  }

  // Dernier secours : Composio générique si rien d'autre n'a marché
  if ((!result || result.items.length === 0) && composioEnabled && def.listVia === "composio") {
    try {
      result = await listComposioResources(resourceType, userId, connectorId, parent, q);
    } catch (err) {
      if (err instanceof NeedsConnectionError || err instanceof InsufficientScopesError) throw err;
      if (!result) throw err;
    }
  }

  result = result ?? { items: [] };
  cache.set(ck, { at: Date.now(), data: result });
  return result;
}
