import { saveComposioConnection, isComposioToolkitConnected } from "@/lib/connections";
import { getComposioClient, toComposioToolkitSlug } from "./client";

async function getAuthConfigId(toolkitSlug: string): Promise<string> {
  const composio = getComposioClient();
  const listed = await composio.authConfigs.list({ toolkit: toolkitSlug });
  const existing = listed.items?.[0]?.id;
  if (existing) return existing;

  const created = await composio.authConfigs.create(toolkitSlug, {
    type: "use_composio_managed_auth",
    name: `Prompta — ${toolkitSlug}`,
  });
  return created.id;
}

export async function startComposioAuth(
  userId: string,
  connectorId: string,
  callbackUrl: string
): Promise<string> {
  const toolkitSlug = toComposioToolkitSlug(connectorId);
  const composio = getComposioClient();
  const authConfigId = await getAuthConfigId(toolkitSlug);

  const connectionRequest = await composio.connectedAccounts.link(userId, authConfigId, {
    callbackUrl,
  });

  const redirectUrl = connectionRequest.redirectUrl;
  if (!redirectUrl) {
    throw new Error(`Composio : pas de redirect URL pour ${toolkitSlug}`);
  }
  return redirectUrl;
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
    await saveComposioConnection(userId, slug, account.id);
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
  const active = accounts.items?.[0];
  if (active?.id) {
    await saveComposioConnection(userId, toolkitSlug, active.id);
    return true;
  }
  return false;
}
