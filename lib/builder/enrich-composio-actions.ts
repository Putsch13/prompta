/**
 * Enrichit un graphe : résout les actions « inventées » des connecteurs
 * Composio-only (ex. google_drive.read_file) vers le vrai outil Composio
 * (slug UPPER_SNAKE) + son schéma d'entrées réel.
 *
 * Conséquence : le contrat, le picker de ressources et l'exécution s'appuient
 * tous sur les VRAIS paramètres (file_id, etc.) au lieu de clés inventées.
 */

import { CONNECTORS } from "@/lib/connectors/registry";
import { isSameConnector } from "@/lib/connectors/resolve-id";
import { updateNode, type PlanGraph } from "@/lib/builder/plan-graph";
import type { ActionInput } from "@/lib/connectors/types";

function isNativeConnector(connectorId: string): boolean {
  return CONNECTORS.some((c) => isSameConnector(c.id, connectorId));
}

/** Une action est-elle au format « inventé » (natif) plutôt qu'un slug Composio ? */
function needsResolution(actionSlug: string, hasInputs: boolean): boolean {
  if (actionSlug.includes(".")) return true;
  // Slug Composio = UPPER_SNAKE. Tout-minuscule = format natif inventé.
  if (actionSlug === actionSlug.toLowerCase()) return true;
  // Slug Composio déjà correct mais sans schéma capturé → on récupère les inputs.
  return !hasInputs;
}

export async function enrichComposioActions(graph: PlanGraph): Promise<PlanGraph> {
  let g = graph;
  for (const node of graph.nodes) {
    if (node.kind !== "action" || !node.connectorId || !node.actionSlug) continue;
    if (isNativeConnector(node.connectorId)) continue;
    if (!needsResolution(node.actionSlug, !!node.actionInputs?.length)) continue;

    try {
      const res = await fetch(
        `/api/composio/resolve-action?connector=${encodeURIComponent(
          node.connectorId,
        )}&action=${encodeURIComponent(node.actionSlug)}`,
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        slug?: string | null;
        name?: string;
        inputs?: ActionInput[];
      };
      if (!data.slug) continue;

      // On ne conserve que les paramètres dont la clé existe dans le vrai schéma
      // (les clés inventées par le plan/copilote sont écartées proprement).
      const validKeys = new Set((data.inputs ?? []).map((i) => i.key));
      const params = Object.fromEntries(
        Object.entries(node.params ?? {}).filter(([k]) => validKeys.has(k)),
      );

      g = updateNode(g, node.id, {
        actionSlug: data.slug,
        actionInputs: data.inputs,
        connectorLabel: data.name,
        params,
      });
    } catch {
      // réseau indisponible → on garde le nœud tel quel
    }
  }
  return g;
}
