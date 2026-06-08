/**
 * Découverte d'une action « lister / rechercher » pour n'importe quel toolkit
 * Composio.
 *
 * Aucun toolkit n'expose d'API de listing uniforme. Plutôt que de coder en dur
 * une action par ressource (impossible à l'échelle de 300+ connecteurs), on
 * inspecte les outils du toolkit et on choisit le meilleur candidat « listant »
 * la ressource visée (ex. `database_id` → on cherche un tool LIST/SEARCH lié aux
 * « database »). Si aucun candidat crédible, le picker retombe sur la saisie
 * manuelle d'ID.
 */

import { listComposioTools, type ComposioToolEntry } from "./catalog";

/** Mots-clés indiquant qu'un tool liste/recherche des ressources. */
const LIST_VERB_RE = /(^|_)(LIST|SEARCH|FIND|FETCH|QUERY|ALL)(_|$)/;
/** Verbes d'écriture/mutation → jamais des actions de listing. */
const MUTATION_RE = /(CREATE|UPDATE|DELETE|REMOVE|ADD|SEND|INSERT|WRITE|PATCH|UPLOAD|MOVE|COPY|ARCHIVE)/;

/** `database_id` → `database`, `spreadsheet_ids` → `spreadsheet`. */
export function resourceNoun(resourceKey: string): string {
  return resourceKey
    .toLowerCase()
    .replace(/_(id|ids)$/i, "")
    .replace(/_/g, "");
}

/** Score d'adéquation d'un tool comme action de listing pour une ressource. */
export function scoreListTool(tool: ComposioToolEntry, noun: string): number {
  const slug = (tool.slug ?? "").toUpperCase();
  if (!slug) return 0;

  let score = 0;
  const hasVerb =
    LIST_VERB_RE.test(slug) || slug.includes("GET_ALL") || slug.includes("GET_MANY");
  if (hasVerb) score += 3;

  const nounU = noun.toUpperCase();
  if (nounU && slug.includes(nounU)) score += 4;
  if (nounU && slug.includes(`${nounU}S`)) score += 1; // pluriel → vraisemblablement un listing

  // Les actions de listing demandent peu/pas d'entrées requises ; on pénalise
  // les tools très paramétrés (souvent des mutations ou des lectures unitaires).
  const requiredCount = tool.inputs.filter((i) => i.required).length;
  score -= requiredCount;

  if (MUTATION_RE.test(slug)) score -= 6;

  return score;
}

/** Meilleur tool de listing du toolkit pour la ressource, ou `undefined`. */
export function pickListTool(
  tools: ComposioToolEntry[],
  resourceKey: string,
): ComposioToolEntry | undefined {
  const noun = resourceNoun(resourceKey);
  let best: ComposioToolEntry | undefined;
  let bestScore = 0;
  for (const tool of tools) {
    const s = scoreListTool(tool, noun);
    if (s > bestScore) {
      bestScore = s;
      best = tool;
    }
  }
  // Seuil : il faut au minimum un verbe de listing (3) ou un fort match de nom.
  return bestScore >= 3 ? best : undefined;
}

const cache = new Map<string, { at: number; slug: string | null }>();
const CACHE_MS = 15 * 60 * 1000;

/** Slug de l'action de listing à exécuter, ou `undefined` si aucune crédible. */
export async function discoverListAction(
  toolkit: string,
  resourceKey: string,
): Promise<string | undefined> {
  const ck = `${toolkit}:${resourceKey}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.slug ?? undefined;

  const tools = await listComposioTools(toolkit);
  const slug = pickListTool(tools, resourceKey)?.slug ?? null;
  cache.set(ck, { at: Date.now(), slug });
  return slug ?? undefined;
}
