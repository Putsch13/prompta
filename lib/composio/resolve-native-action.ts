/**
 * Résout une action au format natif (ex. `google_drive.read_file`) vers le vrai
 * slug d'outil Composio (ex. `GOOGLEDRIVE_DOWNLOAD_FILE`) pour un connecteur
 * Composio-only. Évite la classe de bug où le plan IA invente une action native
 * qui n'existe dans aucun registre → exécution impossible.
 *
 * La sélection est :
 *  - tolérante (synonymes de verbes : read≈download≈get, list≈search…),
 *  - SÛRE (ne choisit jamais une action mutante/destructive pour un verbe en
 *    lecture seule — on préfère échouer franchement que supprimer un fichier).
 */

import { listComposioTools, type ComposioToolEntry } from "./catalog";
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

/** Retire le préfixe toolkit d'un slug Composio : `GOOGLEDRIVE_LIST_FILES` → `list files`. */
function toolTail(slug: string, toolkit: string): string {
  const prefix = toolkit.toLowerCase() + "_";
  const low = slug.toLowerCase();
  const stripped = low.startsWith(prefix) ? low.slice(prefix.length) : low;
  return stripped.replace(/_/g, " ");
}

// Familles de verbes : un verbe demandé matche n'importe quel synonyme.
const VERB_SYNONYMS: Record<string, string[]> = {
  read: ["read", "get", "download", "export", "fetch", "parse", "retrieve", "view", "show", "find"],
  get: ["get", "read", "download", "export", "fetch", "retrieve", "find"],
  download: ["download", "export", "get", "read", "fetch"],
  list: ["list", "search", "find", "getall", "query", "fetch", "all"],
  search: ["search", "find", "list", "query", "lookup"],
  find: ["find", "search", "get", "list", "lookup"],
  create: ["create", "add", "insert", "upload", "new", "make", "post"],
  add: ["add", "create", "insert", "append", "upload"],
  upload: ["upload", "create", "add", "insert", "import"],
  send: ["send", "post", "share", "create", "deliver"],
  update: ["update", "edit", "modify", "patch", "change", "rename", "move", "set"],
  delete: ["delete", "remove", "trash", "destroy", "drop"],
};

const MUTATING = new Set([
  "create", "add", "insert", "upload", "import", "new", "make",
  "update", "edit", "modify", "patch", "change", "rename", "move", "set",
  "delete", "remove", "trash", "destroy", "drop",
  "send", "post", "share", "deliver",
]);

const READ_ONLY_VERBS = new Set([
  "read", "get", "download", "export", "fetch", "parse", "retrieve",
  "list", "search", "find", "view", "show", "lookup", "query",
]);

function verbMatchers(primary: string): Set<string> {
  return new Set(VERB_SYNONYMS[primary] ?? [primary]);
}

/**
 * Choisit le meilleur slug d'outil pour `actionId` parmi `tools`.
 * Fonction PURE (testable sans réseau).
 */
export function pickToolSlug(
  tools: ComposioToolEntry[],
  toolkit: string,
  actionId: string,
): string | null {
  const verb = actionVerb(actionId);
  const verbNorm = norm(verb);
  const verbToks = tokens(verb);
  const primary = verbToks[0] ?? verbNorm;
  const objectToks = verbToks.slice(1); // ex. ["file"] pour read_file
  const synonyms = verbMatchers(primary);
  const requestedReadOnly = READ_ONLY_VERBS.has(primary);

  let best: { slug: string; score: number; len: number } | null = null;

  for (const tool of tools) {
    const tail = toolTail(tool.slug, toolkit);
    const tailToks = new Set([...tokens(tail), ...tokens(tool.name)]);

    const hasVerb = Array.from(synonyms).some((s) => tailToks.has(s));
    const hasMutating = Array.from(tailToks).some((t) => MUTATING.has(t));
    const hasReadToken = Array.from(tailToks).some((t) => READ_ONLY_VERBS.has(t));

    // Garde-fou : verbe demandé en lecture seule mais outil mutant/destructif → on écarte.
    if (requestedReadOnly && hasMutating && !hasReadToken) continue;

    const objectMatch =
      objectToks.length === 0 || objectToks.every((t) => tailToks.has(t));

    let score = 0;
    if (norm(tail) === verbNorm) score = 1000;
    else if (hasVerb && objectMatch) score = 800;
    else if (objectMatch && objectToks.length > 0) score = 400;
    else if (hasVerb) score = 250;
    else {
      let overlap = 0;
      for (const t of verbToks) if (tailToks.has(t)) overlap += 1;
      if (overlap > 0) score = overlap * 120;
    }

    if (score <= 0) continue;
    const len = tail.length;
    if (!best || score > best.score || (score === best.score && len < best.len)) {
      best = { slug: tool.slug, score, len };
    }
  }

  return best && best.score >= 200 ? best.slug : null;
}

const resolveCache = new Map<string, string | null>();

/**
 * Trouve le slug Composio le mieux assorti à `actionId` pour le toolkit du
 * connecteur. Retourne `null` si aucun outil pertinent (et SÛR).
 */
export async function resolveComposioToolSlug(
  connectorId: string,
  actionId: string,
): Promise<string | null> {
  const toolkit = toComposioToolkitSlug(connectorId);
  const cacheKey = `${toolkit}::${actionId}`;
  const cached = resolveCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let tools: ComposioToolEntry[] = [];
  try {
    tools = await listComposioTools(toolkit);
  } catch {
    tools = [];
  }

  const result = tools.length > 0 ? pickToolSlug(tools, toolkit, actionId) : null;
  resolveCache.set(cacheKey, result);
  return result;
}
