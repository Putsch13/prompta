import { getComposioClient, isComposioEnabled } from "./client";
import { parseComposioError, type ComposioErrorResult } from "./errors";
import { getUserConnection } from "@/lib/connections";

export class ComposioExecutionError extends Error {
  readonly details: ComposioErrorResult;

  constructor(details: ComposioErrorResult) {
    super(details.message);
    this.name = "ComposioExecutionError";
    this.details = details;
  }
}

export async function executeComposioTool(
  toolSlug: string,
  userId: string,
  arguments_: Record<string, string>,
  options?: { toolkitSlug?: string; actionVersion?: string; connectedAccountId?: string }
): Promise<{ output: string; metadata?: Record<string, unknown> }> {
  const composio = getComposioClient();
  const toolkitSlug = options?.toolkitSlug ?? toolSlug.split("_")[0]?.toLowerCase();

  const parsedArgs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(arguments_)) {
    if (v === "") continue;
    try {
      parsedArgs[k] = JSON.parse(v);
    } catch {
      parsedArgs[k] = v;
    }
  }

  try {
    const conn = options?.connectedAccountId
      ? null
      : await getUserConnection(userId, toolkitSlug);
    const connectedAccountId = options?.connectedAccountId ?? conn?.accessToken;

    // Composio exige une version de toolkit en exécution manuelle. On épingle
    // une version si fournie (option ou env COMPOSIO_TOOLKIT_VERSION), sinon on
    // exécute la dernière version en neutralisant la vérification stricte —
    // sans quoi l'appel lève « Toolkit version not specified ».
    const pinnedVersion =
      options?.actionVersion ?? process.env.COMPOSIO_TOOLKIT_VERSION?.trim();

    const result = await composio.tools.execute(toolSlug, {
      userId,
      ...(connectedAccountId ? { connectedAccountId } : {}),
      arguments: parsedArgs,
      ...(pinnedVersion
        ? { version: pinnedVersion }
        : { dangerouslySkipVersionCheck: true }),
    });

    const successful = (result as { successful?: boolean }).successful ?? true;
    if (!successful) {
      const errMsg =
        (result as { error?: string }).error ??
        (result as { message?: string }).message ??
        "Échec Composio";
      throw new ComposioExecutionError(
        parseComposioError(new Error(errMsg), toolSlug, toolkitSlug)
      );
    }

    const data = (result as { data?: unknown }).data ?? result;
    const output =
      typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 12000);

    return {
      output,
      metadata: { composio: true, toolSlug, toolkitSlug, actionVersion: options?.actionVersion },
    };
  } catch (err) {
    if (err instanceof ComposioExecutionError) throw err;
    throw new ComposioExecutionError(parseComposioError(err, toolSlug, toolkitSlug));
  }
}

export async function testComposioConnection(
  userId: string,
  toolkitSlug: string
): Promise<{ connected: boolean; provider: "composio" | "native"; accountId?: string; error?: string }> {
  if (!isComposioEnabled()) {
    return { connected: false, provider: "native", error: "COMPOSIO_API_KEY non configurée" };
  }

  const conn = await getUserConnection(userId, toolkitSlug);
  if (conn) {
    return { connected: true, provider: "composio", accountId: conn.accessToken.slice(0, 12) };
  }

  return { connected: false, provider: "composio", error: `Connectez ${toolkitSlug} d'abord` };
}
