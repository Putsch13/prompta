/**
 * Diagnostic d'accès d'un connecteur (P0-4).
 *
 * Au-delà du simple « connecté ou non » (checkConnectorHealth), on tente un
 * appel de LECTURE minimal réel via Composio (lister 1 élément) pour confirmer
 * que les scopes accordés permettent vraiment d'accéder aux données. Cela
 * détecte les cas « connecté mais scope insuffisant » (403) avant le run.
 */

import { getUserConnection } from "@/lib/connections";
import { toComposioToolkitSlug } from "./resolve-id";
import { isComposioEnabled } from "@/lib/composio/client";
import { listComposioTools } from "@/lib/composio/catalog";
import { executeComposioTool, ComposioExecutionError } from "@/lib/composio/execute";
import { checkConnectorHealth, summarizeConnectorAccounts } from "./connection-health";
import { missingRequiredScopes } from "./required-scopes";

export interface DiagnoseResult {
  ok: boolean;
  code:
    | "ok"
    | "not_connected"
    | "expired"
    | "insufficient_scopes"
    | "forbidden"
    | "not_found"
    | "inconclusive"
    | "empty_access"
    | "error";
  message: string;
  scopesPresent?: string[];
  scopesMissing?: string[];
}

/** Choisit une action de listing « sans paramètre requis » pour un test léger. */
function pickProbeTool(
  tools: { slug: string; inputs: { required: boolean }[] }[],
): string | null {
  const LIST_RE = /(^|_)(LIST|SEARCH|GET_ALL|GET_MANY)(_|$)/;
  const candidates = tools
    .filter((t) => LIST_RE.test(t.slug.toUpperCase()))
    .filter((t) => t.inputs.filter((i) => i.required).length === 0)
    .sort((a, b) => a.slug.length - b.slug.length);
  return candidates[0]?.slug ?? null;
}

export async function diagnoseConnectorAccess(
  userId: string,
  connectorId: string,
): Promise<DiagnoseResult> {
  // 1) Santé de base — seul un blocage réel (pas de connexion / expiré) arrête
  // le diagnostic ici. Les signaux scope/identité non bloquants n'empêchent pas
  // le test réel d'accès (étape 2) de confirmer que ça marche.
  const issues = await checkConnectorHealth(userId, [connectorId]);
  const blocker = issues.find((i) => i.blocking);
  if (blocker) {
    const code = blocker.code === "expired" ? "expired" : "not_connected";
    return { ok: false, code, message: blocker.message };
  }

  const conn = await getUserConnection(userId, connectorId);
  const summaries = await summarizeConnectorAccounts(userId, [connectorId]);
  const scopesPresent = summaries[0]?.scopes ?? [];
  const scopesMissing = missingRequiredScopes(scopesPresent, connectorId);

  // 2) Test réel via Composio (uniquement pour les connexions Composio).
  if (!isComposioEnabled() || conn?.provider !== "composio") {
    return {
      ok: true,
      code: "ok",
      message: "Connecté. Test d'accès complet indisponible pour ce type de connexion.",
      scopesPresent,
      scopesMissing,
    };
  }

  const toolkit = toComposioToolkitSlug(connectorId);
  let tools;
  try {
    tools = await listComposioTools(toolkit);
  } catch {
    return { ok: true, code: "inconclusive", message: "Connecté. Catalogue d'outils indisponible.", scopesPresent };
  }

  const probe = pickProbeTool(tools);
  if (!probe) {
    return {
      ok: true,
      code: "inconclusive",
      message: "Connecté. Aucune action de lecture simple pour tester l'accès.",
      scopesPresent,
    };
  }

  try {
    const probeOut = await executeComposioTool(probe, userId, {}, { toolkitSlug: toolkit });
    // Succès技 mais accès VIDE : beaucoup d'apps répondent 200 avec un
    // message explicatif (« aucune page partagée avec l'intégration »,
    // workspace vide…). On le remonte dès la connexion au lieu de laisser
    // l'utilisateur le découvrir au premier run.
    try {
      const parsed = JSON.parse(probeOut.output ?? "") as {
        composio_execution_message?: unknown;
        items?: unknown[];
        results?: unknown[];
        data?: unknown[];
      };
      const emptyList =
        (Array.isArray(parsed.items) && parsed.items.length === 0) ||
        (Array.isArray(parsed.results) && parsed.results.length === 0) ||
        (Array.isArray(parsed.data) && parsed.data.length === 0);
      const appMsg =
        typeof parsed.composio_execution_message === "string"
          ? parsed.composio_execution_message.trim()
          : "";
      if (appMsg && (emptyList || /no |aucun|empty|not.*shared|0 /i.test(appMsg))) {
        return {
          ok: false,
          code: "empty_access",
          message: `Connecté, mais aucune donnée accessible — ${appMsg.slice(0, 220)} Vérifie le partage/permissions côté app puis reconnecte si besoin.`,
          scopesPresent,
          scopesMissing,
        };
      }
    } catch {
      // sortie non-JSON — accès considéré OK
    }
    return { ok: true, code: "ok", message: "Accès vérifié ✓", scopesPresent, scopesMissing };
  } catch (err) {
    if (err instanceof ComposioExecutionError) {
      const code = (err.details.code ?? "").toLowerCase();
      const msg = `${code} ${err.details.message ?? ""}`.toLowerCase();
      if (/permission_denied|403|forbidden|insufficient|scope/.test(msg)) {
        return {
          ok: false,
          code: "forbidden",
          message:
            "Connecté mais accès refusé (scope insuffisant). Reconnectez en autorisant l'accès complet.",
          scopesPresent,
          scopesMissing,
        };
      }
      if (/401|unauthor|invalid.*credential|token/.test(msg)) {
        return { ok: false, code: "expired", message: "Jeton expiré ou invalide. Reconnectez le compte.", scopesPresent };
      }
      // 404 / autres → l'accès fonctionne mais la ressource de test est absente.
      return { ok: true, code: "ok", message: "Accès vérifié ✓", scopesPresent, scopesMissing };
    }
    return { ok: true, code: "inconclusive", message: "Connecté. Test d'accès non concluant.", scopesPresent };
  }
}
