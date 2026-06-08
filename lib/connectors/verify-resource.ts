/**
 * Vérifie qu'une ressource précise (ID de sheet, fichier Drive, base…) est
 * réellement ACCESSIBLE par le compte connecté, au moment où le builder/l'IA la
 * renseigne — plutôt que de découvrir l'échec au run.
 *
 * Stratégie : on tente un GET/READ direct sur l'ID via le bon outil Composio.
 * Garde-fou : si l'outil de lecture exige d'autres paramètres requis que l'ID,
 * on ne devine pas → résultat « inconclusive » (pas de faux négatif).
 */

import { getUserConnection } from "@/lib/connections";
import { toComposioToolkitSlug } from "./resolve-id";
import { isComposioEnabled } from "@/lib/composio/client";
import { listComposioTools, type ComposioToolEntry } from "@/lib/composio/catalog";
import { executeComposioTool, ComposioExecutionError } from "@/lib/composio/execute";
import { pickToolSlug } from "@/lib/composio/resolve-native-action";

export type VerifyResourceStatus =
  | "ok"
  | "not_found"
  | "forbidden"
  | "no_connection"
  | "inconclusive";

export interface VerifyResourceResult {
  status: VerifyResourceStatus;
  label?: string;
  message?: string;
}

/** Nom de base de la ressource depuis son resourceType (pour cibler l'outil GET). */
function resourceNoun(resourceType: string): string {
  if (resourceType.includes(":")) {
    // composio:<toolkit>:<param_key>
    const key = resourceType.split(":").pop() ?? "";
    return key.replace(/_ids?$/i, "").replace(/_/g, " ").trim();
  }
  if (resourceType.includes(".")) {
    return resourceType.split(".").pop()!.replace(/_/g, " ").trim();
  }
  return resourceType.replace(/_/g, " ").trim();
}

/** Trouve la clé d'entrée qui porte l'identifiant de la ressource. */
function findIdKey(tool: ComposioToolEntry, noun: string): string | null {
  const nounKey = noun.replace(/\s+/g, "");
  const required = tool.inputs.filter((i) => i.required);
  const idLike = (k: string) => /_(id|ids)$/i.test(k) || /id$/i.test(k);

  // 1) requis qui ressemble à un id et contient le noun
  const reqNoun = required.find((i) => idLike(i.key) && i.key.toLowerCase().includes(nounKey));
  if (reqNoun) return reqNoun.key;
  // 2) un seul requis id-like
  const reqIds = required.filter((i) => idLike(i.key) || i.kind === "resource" || !!i.resourceType);
  if (reqIds.length === 1) return reqIds[0].key;
  // 3) sinon, tout id-like (même optionnel) contenant le noun
  const anyNoun = tool.inputs.find((i) => idLike(i.key) && i.key.toLowerCase().includes(nounKey));
  if (anyNoun) return anyNoun.key;
  // 4) un seul id-like au total
  const anyIds = tool.inputs.filter((i) => idLike(i.key));
  if (anyIds.length === 1) return anyIds[0].key;
  return null;
}

/** Extrait un libellé lisible (titre/nom) depuis la sortie JSON Composio. */
function extractLabel(output: string): string | undefined {
  try {
    const data = JSON.parse(output);
    const keys = ["title", "name", "displayName", "fileName", "spreadsheetTitle"];
    const search = (obj: unknown, depth: number): string | undefined => {
      if (!obj || depth > 4) return undefined;
      if (Array.isArray(obj)) {
        for (const it of obj.slice(0, 5)) {
          const r = search(it, depth + 1);
          if (r) return r;
        }
        return undefined;
      }
      if (typeof obj === "object") {
        const rec = obj as Record<string, unknown>;
        for (const k of keys) {
          if (typeof rec[k] === "string" && rec[k]) return rec[k] as string;
        }
        for (const v of Object.values(rec)) {
          const r = search(v, depth + 1);
          if (r) return r;
        }
      }
      return undefined;
    };
    return search(data, 0);
  } catch {
    return undefined;
  }
}

export async function verifyResourceAccess(opts: {
  userId: string;
  connectorId: string;
  resourceType: string;
  value: string;
}): Promise<VerifyResourceResult> {
  const { userId, connectorId, resourceType, value } = opts;
  if (!value.trim()) return { status: "inconclusive" };

  const conn = await getUserConnection(userId, connectorId);
  if (!conn?.accessToken) return { status: "no_connection" };

  if (!isComposioEnabled() || conn.provider !== "composio") {
    // Vérification directe non disponible pour les connexions natives ici.
    return { status: "inconclusive" };
  }

  const toolkit = toComposioToolkitSlug(connectorId);
  let tools: ComposioToolEntry[] = [];
  try {
    tools = await listComposioTools(toolkit);
  } catch {
    return { status: "inconclusive" };
  }
  if (tools.length === 0) return { status: "inconclusive" };

  const noun = resourceNoun(resourceType);
  const getSlug = pickToolSlug(tools, toolkit, `get_${noun}`) ?? pickToolSlug(tools, toolkit, `get ${noun}`);
  if (!getSlug) return { status: "inconclusive" };

  const tool = tools.find((t) => t.slug === getSlug);
  if (!tool) return { status: "inconclusive" };

  const idKey = findIdKey(tool, noun);
  if (!idKey) return { status: "inconclusive" };

  // Garde-fou : d'autres paramètres requis que l'ID → on ne devine pas.
  const otherRequired = tool.inputs.filter((i) => i.required && i.key !== idKey);
  if (otherRequired.length > 0) return { status: "inconclusive" };

  try {
    const res = await executeComposioTool(getSlug, userId, { [idKey]: value }, { toolkitSlug: toolkit });
    return { status: "ok", label: extractLabel(res.output) };
  } catch (err) {
    if (err instanceof ComposioExecutionError) {
      const code = (err.details.code ?? "").toLowerCase();
      const msg = `${code} ${err.details.message ?? ""}`.toLowerCase();
      if (/connection_missing|connection_expired/.test(code) || /401|unauthor|invalid.*credential|\btoken\b/.test(msg)) {
        return { status: "no_connection", message: err.details.message };
      }
      if (/permission_denied/.test(code) || /403|forbidden|permission|access denied|not.*author/.test(msg)) {
        return { status: "forbidden", message: err.details.message };
      }
      if (/404|not.?found|introuvable|does not exist|no.*found/.test(msg)) {
        return { status: "not_found", message: err.details.message };
      }
      return { status: "inconclusive", message: err.details.message };
    }
    return { status: "inconclusive" };
  }
}
