import { saveComposioConnection, isComposioToolkitConnected } from "@/lib/connections";
import { getComposioClient, toComposioToolkitSlug } from "./client";

export async function startComposioAuth(
  userId: string,
  connectorId: string,
  callbackUrl: string
): Promise<string> {
  const toolkitSlug = toComposioToolkitSlug(connectorId);
  const composio = getComposioClient();

  const connectionRequest = await composio.toolkits.authorize(userId, toolkitSlug);
  const redirectUrl = connectionRequest.redirectUrl;
  if (!redirectUrl) {
    throw new Error(`Composio : pas de redirect URL pour ${toolkitSlug}`);
  }

  // Composio gère le callback via redirectUrl ; callbackUrl Prompta pour sync locale
  void callbackUrl;
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
