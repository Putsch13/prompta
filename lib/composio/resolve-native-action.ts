/**
 * Résout une action au format natif (ex. `google_drive.list_files`) vers le
 * vrai slug d'outil Composio (ex. `GOOGLEDRIVE_LIST_FILES`) pour un connecteur
 * Composio-only. Évite la classe de bug où le plan IA invente une action native
 * qui n'existe dans aucun registre → exécution impossible.
 */

import { listComposioTools } from "./catalog";
import { toComposioToolkitSlug } from "@/lib/connectors/resolve-id";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Partie « verbe » d'une action native : `connector.verb` → `verb`. */
export function actionVerb(actionId: string): string {
  const dot = actionId.indexOf(".");
  return dot >= 0 ? actionId.slice(dot + 1) : actionId;
}

/** Retire le préfixe toolkit d'un slug Composio : `GOOGLEDRIVE_LIST_FILES` → `LIST_FILES`. */
function stripToolkitPrefix(slug: string, toolkit: string): string {
  const up = slug.toUpperCase();
  const prefix = toolkit.toUpperCase() + "_";
  return up.startsWith(prefix) ? up.slice(prefix.length) : up;
}

const resolveCache = new Map<string, string | null>();

/**
 * Trouve le slug Composio le mieux assorti à `actionId` pour `toolkitSlug`.
 * Retourne `null` si aucun outil pertinent.
 */
export async function resolveComposioToolSlug(
  connectorId: string,
  actionId: string,
): Promise<string | null> {
  const toolkit = toComposioToolkitSlug(connectorId);
  const cacheKey = `${toolkit}::${actionId}`;
  const cached = resolveCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let tools: Awaited<ReturnType<typeof listComposioTools>> = [];
  try {
    tools = await listComposioTools(toolkit);
  } catch {
    tools = [];
  }
  if (tools.length === 0) {
    resolveCache.set(cacheKey, null);
    return null;
  }

  const verb = actionVerb(actionId);
  const verbNorm = norm(verb);
  const verbTokens = tokens(verb);

  let best: { slug: string; score: number } | null = null;
  for (const tool of tools) {
    const tail = stripToolkitPrefix(tool.slug, toolkit);
    let score = 0;

    if (norm(tail) === verbNorm) score = 1000;
    else if (norm(tail).includes(verbNorm) || verbNorm.includes(norm(tail))) score = 500;
    else {
      const toolTokens = new Set([...tokens(tail), ...tokens(tool.name)]);
      let overlap = 0;
      for (const t of verbTokens) if (toolTokens.has(t)) overlap += 1;
      if (overlap > 0) score = overlap * 100 - tail.length;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { slug: tool.slug, score };
    }
  }

  const result = best && best.score >= 100 ? best.slug : null;
  resolveCache.set(cacheKey, result);
  return result;
}
