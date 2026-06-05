import { getUserConnection } from "@/lib/connections";
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
  parent?: string,
): Promise<ListResourcesResult> {
  const def = getResourceType(resourceType);
  if (!def?.listAction) return { items: [] };

  const { executeComposioTool } = await import("@/lib/composio/execute");
  try {
    const result = await executeComposioTool(def.listAction, userId, {}, {
      toolkitSlug: def.connectorId,
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

export class NeedsConnectionError extends Error {
  constructor(public connectorId: string) {
    super(`Connexion ${connectorId} requise`);
    this.name = "NeedsConnectionError";
  }
}

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

  const ctx: ExecuteContext = { userId, accessToken: conn.accessToken };
  let result: ListResourcesResult;
  if (def.listVia === "native") {
    result = await listNativeResources(resourceType, ctx, parent, q);
  } else {
    result = await listComposioResources(resourceType, userId, parent);
  }

  cache.set(ck, { at: Date.now(), data: result });
  return result;
}
