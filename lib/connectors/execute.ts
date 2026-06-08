import type { ExecuteContext, ExecuteResult } from "./types";
import { executeNativeConnectorAction } from "./execute-native";
import { isComposioEnabled } from "@/lib/composio/client";
import { ComposioExecutionError, executeComposioTool } from "@/lib/composio/execute";
import { composioMappingFor } from "./native-to-composio";

/** Actions legacy maison (gmail.send, slack.send…) */
function isNativeAction(actionId: string): boolean {
  return actionId.includes(".") && actionId === actionId.toLowerCase();
}

async function runComposio(
  toolSlug: string,
  userId: string,
  args: Record<string, string>,
  toolkitSlug?: string,
): Promise<ExecuteResult> {
  try {
    return await executeComposioTool(toolSlug, userId, args, { toolkitSlug });
  } catch (err) {
    if (err instanceof ComposioExecutionError) {
      throw new Error(`[${err.details.code}] ${err.details.message}`);
    }
    throw err;
  }
}

const RETRY_BACKOFF_MS = [1000, 3000, 9000];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_ATTEMPTS = 3;

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up/i.test(msg)) {
      return true;
    }
    const statusMatch = msg.match(/\[(\d{3})\]/);
    if (statusMatch && RETRYABLE_STATUS_CODES.has(Number(statusMatch[1]))) {
      return true;
    }
  }
  return false;
}

async function withRetry<T>(
  actionId: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1 && isRetryableError(err)) {
        const delay = RETRY_BACKOFF_MS[attempt];
        console.warn(
          `[connector:retry] action=${actionId} attempt=${attempt + 1}/${MAX_ATTEMPTS} ` +
          `retrying in ${delay}ms — ${err instanceof Error ? err.message : String(err)}`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function executeConnectorAction(
  actionId: string,
  params: Record<string, string>,
  ctx: ExecuteContext
): Promise<ExecuteResult> {
  if (ctx.dryRun) {
    const summary = Object.entries(params)
      .map(([k, v]) => `${k}: ${v.slice(0, 80)}`)
      .join(", ");
    return {
      output: `[APERÇU — aucune action réelle]\nAction : ${actionId}\n${summary || "(sans paramètres)"}\n(dry-run — rien n'a été envoyé aux services externes)`,
      metadata: { simulated: true },
    };
  }

  return withRetry(actionId, async () => {
    const composioOn = isComposioEnabled();

    // 1) Action déjà au format Composio (UPPER_SNAKE) → exécution Composio directe.
    //    Le toolkit vient du connecteur de l'étape (slug du catalogue) si dispo,
    //    sinon on le déduit du préfixe du slug (ex. GOOGLESHEETS_… → googlesheets).
    if (composioOn && !isNativeAction(actionId)) {
      const toolkitSlug = ctx.connector?.trim() || actionId.split("_")[0]?.toLowerCase();
      return runComposio(actionId, ctx.userId, params, toolkitSlug);
    }

    // 2) Action native MAIS la connexion de l'utilisateur passe par Composio :
    //    on traduit vers l'outil Composio équivalent (sinon 401 garanti côté API native).
    if (ctx.provider === "composio") {
      const mapping = composioMappingFor(actionId);
      if (mapping) {
        if (!composioOn) {
          throw new Error(
            `${ctx.connector ?? actionId} est connecté via Composio mais COMPOSIO_API_KEY n'est pas configurée côté serveur.`,
          );
        }
        return runComposio(
          mapping.toolSlug,
          ctx.userId,
          mapping.mapParams(params),
          mapping.toolkitSlug,
        );
      }
      throw new Error(
        `L'action « ${actionId} » n'est pas encore disponible via Composio — reconnectez ${ctx.connector ?? "ce service"} en mode natif pour l'utiliser.`,
      );
    }

    // 3) Connexion native → API du service en direct.
    return executeNativeConnectorAction(actionId, params, ctx);
  });
}
