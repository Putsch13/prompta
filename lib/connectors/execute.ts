import type { ExecuteContext, ExecuteResult } from "./types";
import { executeNativeConnectorAction } from "./execute-native";
import { isComposioEnabled } from "@/lib/composio/client";
import { ComposioExecutionError, executeComposioTool } from "@/lib/composio/execute";
import { composioMappingFor } from "./native-to-composio";
import { toComposioToolkitSlug, isSameConnector } from "./resolve-id";
import { CONNECTORS } from "./registry";
import { resolveComposioToolSlug, actionVerb } from "@/lib/composio/resolve-native-action";

/** Le connecteur existe-t-il dans le registre natif maison ? */
function hasNativeConnector(connectorId?: string): boolean {
  if (!connectorId) return false;
  return CONNECTORS.some((c) => isSameConnector(c.id, connectorId));
}

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
      // Normalise le slug toolkit (ex. google_drive → googledrive) pour éviter
      // que la classe de bug Drive se reproduise sur n'importe quel connecteur.
      const rawToolkit = ctx.connector?.trim() || actionId.split("_")[0]?.toLowerCase() || "";
      const toolkitSlug = rawToolkit ? toComposioToolkitSlug(rawToolkit) : undefined;
      return runComposio(actionId, ctx.userId, params, toolkitSlug);
    }

    // 0bis) Action au format natif (connector.verb) MAIS connecteur Composio-only
    //       (aucun registre natif) → le plan a inventé une action inexistante.
    //       On la résout vers le vrai slug Composio via le catalogue. En cas
    //       d'échec, message CLAIR (ne pas retomber sur « reconnectez en natif »
    //       qui devient un trompeur « Connectez … » après mapping).
    if (isNativeAction(actionId) && !hasNativeConnector(ctx.connector)) {
      const connectorId = ctx.connector?.trim() || actionId.split(".")[0] || "";
      const toolkit = toComposioToolkitSlug(connectorId);
      if (!composioOn) {
        throw new Error(
          `Le connecteur ${toolkit} fonctionne via Composio, mais COMPOSIO_API_KEY n'est pas configurée côté serveur.`,
        );
      }
      const resolvedSlug = await resolveComposioToolSlug(connectorId, actionId);
      if (resolvedSlug) {
        return runComposio(resolvedSlug, ctx.userId, params, toolkit);
      }
      throw new Error(
        `Action « ${actionVerb(actionId)} » introuvable dans le toolkit ${toolkit}. Ouvrez l'étape dans le builder et choisissez une action existante.`,
      );
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
