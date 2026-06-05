import type { KeyProvider } from "@/lib/keys";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { graphConnectors, graphToSteps, type PlanGraph } from "@/lib/builder/plan-graph";
import { connectorsForSteps } from "@/lib/connectors/registry";
import { dedupeConnectors } from "@/lib/connectors/resolve-id";

/** Dérive connecteurs et clés LLM depuis le graphe (plus de saisie globale). */
export function deriveGraphEnv(
  graph: PlanGraph | null,
  defaultModel: string,
): {
  requiredConnectors: string[];
  requiredSecrets: KeyProvider[];
} {
  if (!graph) {
    return { requiredConnectors: [], requiredSecrets: [] };
  }

  const steps = graphToSteps(graph, defaultModel);
  const connectors = dedupeConnectors([
    ...graphConnectors(graph),
    ...connectorsForSteps(steps),
  ]);

  const providers = new Set<KeyProvider>();
  for (const node of graph.nodes) {
    if (node.kind === "llm") {
      const { provider } = resolveModelOrDefault(node.model ?? defaultModel);
      providers.add(provider as KeyProvider);
    }
    if (node.kind === "tool" && node.toolId === "web_search") {
      providers.add("serper");
    }
  }

  return {
    requiredConnectors: connectors,
    requiredSecrets: Array.from(providers),
  };
}
