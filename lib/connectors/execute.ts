import type { ExecuteContext, ExecuteResult } from "./types";
import { executeNativeConnectorAction } from "./execute-native";
import { isComposioEnabled } from "@/lib/composio/client";
import { ComposioExecutionError, executeComposioTool } from "@/lib/composio/execute";
import { composioMappingFor } from "./native-to-composio";
import { toComposioToolkitSlug, isSameConnector } from "./resolve-id";
import { CONNECTORS } from "./registry";
import { resolveComposioToolSlug, actionVerb } from "@/lib/composio/resolve-native-action";
import { getComposioToolInputKeys, alignArgKeysToSchema } from "@/lib/composio/catalog";
import { guardComposioParams } from "@/lib/composio/param-guard";

/** Le connecteur existe-t-il dans le registre natif maison ? */
function hasNativeConnector(connectorId?: string): boolean {
  if (!connectorId) return false;
  return CONNECTORS.some((c) => isSameConnector(c.id, connectorId));
}

/** Actions legacy maison (gmail.send, slack.send…) */
function isNativeAction(actionId: string): boolean {
  return actionId.includes(".") && actionId === actionId.toLowerCase();
}

/**
 * Ressemble à un vrai slug d'outil Composio (UPPER_SNAKE, ex. CANVA_CREATE_DESIGN) ?
 * Un « verbe » nu généré par le builder (ex. create_design) n'en est PAS un et
 * doit être résolu via le catalogue, sinon Composio renvoie « Unable to retrieve tool ».
 */
function looksLikeComposioSlug(actionId: string): boolean {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(actionId);
}

async function runComposio(
  toolSlug: string,
  userId: string,
  args: Record<string, string>,
  toolkitSlug?: string,
): Promise<ExecuteResult> {
  // Garde générique (300+ toolkits) : défauts du schéma + validation des
  // champs requis AVANT l'appel — erreur actionnable plutôt que le
  // « Following fields are missing » brut du provider. Les types du schéma
  // (array/object/number) pilotent la coercition des arguments.
  let finalArgs = args;
  let argTypes: Record<string, import("@/lib/composio/execute").ComposioArgType> | undefined;
  if (toolkitSlug) {
    const guarded = await guardComposioParams(toolkitSlug, toolSlug, args);
    finalArgs = guarded.args;
    argTypes = guarded.argTypes;
  }
  try {
    return await executeComposioTool(toolSlug, userId, finalArgs, { toolkitSlug, argTypes });
  } catch (err) {
    if (err instanceof ComposioExecutionError) {
      throw new Error(`[${err.details.code}] ${err.details.message}`);
    }
    throw err;
  }
}

function hasTextContentParam(params: Record<string, string>): boolean {
  return ["text_content", "content", "body", "text", "markdown_text", "html_content"].some((k) =>
    Object.keys(params).some(
      (p) => p.toLowerCase().includes(k) && String(params[p] ?? "").trim() !== "",
    ),
  );
}

/**
 * Résout dynamiquement le bon outil Composio pour une action native, aligne les
 * noms de paramètres sur le schéma réel de l'outil (générique, tous toolkits),
 * puis exécute. Retourne `null` si aucun outil pertinent n'est trouvé.
 */
async function runComposioDynamic(
  connectorId: string,
  toolkit: string,
  actionId: string,
  userId: string,
  params: Record<string, string>,
): Promise<ExecuteResult | null> {
  // Mapping curaté D'ABORD : les cas ambigus tranchés à la main (youtube.search,
  // sheets.add_tab…) priment sur la résolution dynamique. Sans ce passage, les
  // connecteurs sans registre natif (youtube, notion…) n'atteignaient jamais le
  // mapping (branches 1bis/0bis) et retombaient sur le mauvais outil.
  const curated = composioMappingFor(actionId);
  if (curated) {
    const mapped = curated.mapParams(params);
    const expectedKeys = await getComposioToolInputKeys(curated.toolkitSlug, curated.toolSlug);
    return runComposio(curated.toolSlug, userId, alignArgKeysToSchema(mapped, expectedKeys), curated.toolkitSlug);
  }
  const resolvedSlug = await resolveComposioToolSlug(connectorId, actionId, {
    hasTextContent: hasTextContentParam(params),
  });
  if (!resolvedSlug) return null;
  const expectedKeys = await getComposioToolInputKeys(toolkit, resolvedSlug);
  return runComposio(resolvedSlug, userId, alignArgKeysToSchema(params, expectedKeys), toolkit);
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

    // 1) Action déjà au format Composio (UPPER_SNAKE, ex. CANVA_CREATE_DESIGN) →
    //    exécution Composio directe. Le toolkit vient du connecteur de l'étape si
    //    dispo, sinon du préfixe du slug (ex. GOOGLESHEETS_… → googlesheets).
    if (composioOn && looksLikeComposioSlug(actionId)) {
      const rawToolkit = ctx.connector?.trim() || actionId.split("_")[0]?.toLowerCase() || "";
      const toolkitSlug = rawToolkit ? toComposioToolkitSlug(rawToolkit) : undefined;
      const expectedKeys = toolkitSlug ? await getComposioToolInputKeys(toolkitSlug, actionId) : [];
      return runComposio(actionId, ctx.userId, alignArgKeysToSchema(params, expectedKeys), toolkitSlug);
    }

    // 1bis) « Verbe » nu généré par le builder (ex. create_design, send_message) :
    //       ni slug Composio valide, ni action native dotée. On résout le bon
    //       outil via le catalogue du toolkit au lieu d'envoyer un slug invalide.
    if (composioOn && !isNativeAction(actionId)) {
      const connectorId = ctx.connector?.trim() || actionId.split(/[._]/)[0] || "";
      const toolkit = toComposioToolkitSlug(connectorId);
      const result = await runComposioDynamic(connectorId, toolkit, actionId, ctx.userId, params);
      if (result) return result;
      throw new Error(
        `Action « ${actionVerb(actionId)} » introuvable dans le toolkit ${toolkit} via Composio. Ouvrez l'étape dans le builder et choisissez une action existante.`,
      );
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
      const result = await runComposioDynamic(connectorId, toolkit, actionId, ctx.userId, params);
      if (result) return result;
      throw new Error(
        `Action « ${actionVerb(actionId)} » introuvable dans le toolkit ${toolkit}. Ouvrez l'étape dans le builder et choisissez une action existante.`,
      );
    }

    // 2) Action native MAIS la connexion de l'utilisateur passe par Composio :
    //    on traduit vers l'outil Composio équivalent (sinon 401 garanti côté API native).
    if (ctx.provider === "composio") {
      if (!composioOn) {
        throw new Error(
          `${ctx.connector ?? actionId} est connecté via Composio mais COMPOSIO_API_KEY n'est pas configurée côté serveur.`,
        );
      }

      // a) Mapping statique connu → traduction propre des paramètres, PUIS
      //    alignement sur le schéma réel de l'outil (spreadsheet_id →
      //    spreadsheetId…) comme le fait le chemin dynamique.
      const mapping = composioMappingFor(actionId);
      if (mapping) {
        const mapped = mapping.mapParams(params);
        const expectedKeys = await getComposioToolInputKeys(mapping.toolkitSlug, mapping.toolSlug);
        return runComposio(
          mapping.toolSlug,
          ctx.userId,
          alignArgKeysToSchema(mapped, expectedKeys),
          mapping.toolkitSlug,
        );
      }

      // b) Pas de mapping statique → résolution dynamique du bon outil Composio
      //    via le catalogue du toolkit (au lieu du faux « reconnectez en natif »),
      //    avec alignement générique des noms de paramètres sur le schéma réel.
      const connectorId = ctx.connector?.trim() || actionId.split(".")[0] || "";
      const toolkit = toComposioToolkitSlug(connectorId);
      const result = await runComposioDynamic(connectorId, toolkit, actionId, ctx.userId, params);
      if (result) return result;

      throw new Error(
        `Action « ${actionVerb(actionId)} » introuvable dans le toolkit ${toolkit} via Composio. Ouvrez l'étape dans le builder et choisissez une action existante.`,
      );
    }

    // 3) Connexion native → API du service en direct.
    return executeNativeConnectorAction(actionId, params, ctx);
  });
}
