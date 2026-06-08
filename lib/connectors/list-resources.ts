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
    // Beaucoup de tools de listing acceptent un parent (ex. AIRTABLE_LIST_TABLES
    // attend base_id) et/ou une recherche : on passe ce qu'on a, best-effort.
    const args: Record<string, string> = {};
    if (parent && def.parentType) {
      const parentDef = getResourceType(def.parentType);
      const parentKey = parentDef ? composioParamForResource(parentDef.id) : undefined;
      if (parentKey) args[parentKey] = parent;
    }
    if (q) args.query = q;

    const result = await executeComposioTool(def.listAction, userId, args, {
      toolkitSlug: toComposioToolkitSlug(def.connectorId),
    });
    const items = parseComposioResourceList(result.output, parent);
    return { items };
  } catch {
    return { items: [] };
  }
}

/** Devine la clé d'argument Composio pour un id de ressource parent. */
function composioParamForResource(resourceTypeId: string): string | undefined {
  const leaf = resourceTypeId.split(".")[1];
  if (!leaf) return undefined;
  // ex. airtable.base → base_id ; notion.database → database_id
  return `${leaf}_id`;
}

function firstString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

const ID_KEYS = [
  "id",
  "spreadsheetId",
  "spreadsheet_id",
  "fileId",
  "file_id",
  "page_id",
  "database_id",
  "base_id",
  "table_id",
  "channel_id",
  "calendar_id",
  "gid",
  "key",
  "uuid",
  "number",
];
const LABEL_KEYS = [
  "name",
  "title",
  "label",
  "display_name",
  "displayName",
  "full_name",
  "fullName",
  "summary",
  "subject",
  "email",
  "channel_name",
];

/** Un objet ressemble-t-il à un spreadsheet (a un id + un nom) ? */
function toSpreadsheetItem(o: Record<string, unknown>): ResourceListItem | null {
  const id = (o.id ?? o.spreadsheetId ?? o.spreadsheet_id ?? o.fileId ?? o.file_id) as
    | string
    | undefined;
  if (!id || typeof id !== "string") return null;
  const label = (o.name ?? o.title ?? o.label ?? id) as string;
  return { id, label: String(label) };
}

/** Objet générique de ressource Composio (id + libellé devinés). */
function toResourceItem(parent?: string) {
  return (o: Record<string, unknown>): ResourceListItem | null => {
    const id = firstString(o, ID_KEYS);
    if (!id) return null;
    const rawLabel = firstString(o, LABEL_KEYS);
    return { id, label: rawLabel ?? id, ...(parent ? { parentId: parent } : {}) };
  };
}

/**
 * Cherche récursivement le **premier tableau d'objets** qu'on sait transformer
 * en items (via `toItem`). Composio renvoie des formes variables (`{results}`,
 * `{bases}`, `{files}`, `{data:{…}}`, `{response_data:{…}}`…) ; ce parseur
 * générique évite d'énumérer chaque clé connue par toolkit.
 */
function findFirstItemArray(
  parsed: unknown,
  toItem: (o: Record<string, unknown>) => ResourceListItem | null,
): ResourceListItem[] {
  const seen = new Set<unknown>();
  const stack: unknown[] = [parsed];
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      const items = node
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map(toItem)
        .filter((x): x is ResourceListItem => x !== null);
      if (items.length > 0) return items;
      for (const child of node) stack.push(child);
      continue;
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return [];
}

function parseComposioSpreadsheetOutput(output: string): ResourceListItem[] {
  try {
    return findFirstItemArray(JSON.parse(output), toSpreadsheetItem);
  } catch {
    return [];
  }
}

/** Parseur générique : tout toolkit Composio (Notion, Airtable, GitHub…). */
export function parseComposioResourceList(output: string, parent?: string): ResourceListItem[] {
  try {
    return findFirstItemArray(JSON.parse(output), toResourceItem(parent));
  } catch {
    return [];
  }
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
 * Liste les ressources d'un connecteur pour le picker.
 *
 * Principe clé : on branche selon le **provider de la connexion**, pas en mode
 * « essaie Composio puis retombe sur le natif ». Une connexion Composio n'a pas
 * de token Google natif exploitable, et une connexion native n'a pas de compte
 * Composio. Mélanger les deux provoquait une boucle « reconnectez » (le
 * scope-check natif échouait systématiquement sur une connexion Composio dont
 * les scopes ne sont pas exposés).
 *
 *  - Connexion Composio → listing Composio uniquement. Si Composio ne renvoie
 *    rien, on renvoie une liste vide (l'UI propose alors « coller un ID »).
 *    On ne déclenche JAMAIS le scope-check natif.
 *  - Connexion native → listing natif (avec contrôle de scopes Google).
 *  - Seul `NeedsConnectionError` remonte pour afficher « Reconnecter ».
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
  const isComposioConnection = status?.provider === "composio";

  let result: ListResourcesResult | null = null;

  // --- Connexion Composio : Composio uniquement, jamais de scope-check natif ---
  if (composioEnabled && isComposioConnection) {
    try {
      if (resourceType.startsWith("google_sheets.")) {
        result = await listComposioGoogleSheetsResources(resourceType, userId, connectorId, parent, q);
      } else {
        result = await listComposioResources(resourceType, userId, connectorId, parent, q);
      }
    } catch (err) {
      // Seule l'absence de connexion bloque ; tout le reste → liste vide
      // (l'UI bascule sur la saisie manuelle d'ID, pas de boucle reconnexion).
      if (err instanceof NeedsConnectionError) throw err;
      result = null;
    }
    result = result ?? { items: [] };
    cache.set(ck, { at: Date.now(), data: result });
    return result;
  }

  // --- Connexion native ---
  const ctx: ExecuteContext = { userId, accessToken: conn.accessToken };

  if (def.listVia === "native") {
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
  } else if (composioEnabled && def.listVia === "composio") {
    try {
      result = await listComposioResources(resourceType, userId, connectorId, parent, q);
    } catch (err) {
      if (err instanceof NeedsConnectionError) throw err;
      result = null;
    }
  }

  result = result ?? { items: [] };
  cache.set(ck, { at: Date.now(), data: result });
  return result;
}
