import { callModel } from "@/lib/llm/gateway";
import type { ResolvedModel } from "@/lib/llm/resolve-model";
import {
  GeneratedAgentPlanSchema,
  type GeneratedAgentPlan,
} from "@/lib/builder/generate-agent-plan";

const SYSTEM_PROMPT = `Tu es un architecte d'agents IA expert pour Prompta.
Tu reçois un plan JSON existant et une instruction de modification.
Tu renvoies le plan COMPLET modifié.

Règles :
1. Préserve les ids des steps non concernés par la modification.
2. Ajoute/supprime/réordonne le minimum nécessaire.
3. Utilise "next" pour les branches parallèles et "branchLabel" sur les steps cibles.
4. "entryStepId" pointe vers le premier step.
5. Réponds UNIQUEMENT en JSON valide, sans markdown.`;

function stepFingerprint(step: GeneratedAgentPlan["steps"][number]): string {
  return JSON.stringify(step);
}

export function diffPlanIds(
  oldPlan: GeneratedAgentPlan,
  newPlan: GeneratedAgentPlan,
): string[] {
  const oldMap = new Map(oldPlan.steps.map((s) => [s.id, stepFingerprint(s)]));
  const changed = new Set<string>();
  for (const s of newPlan.steps) {
    if (!oldMap.has(s.id) || oldMap.get(s.id) !== stepFingerprint(s)) {
      changed.add(s.id);
    }
  }
  for (const id of Array.from(oldMap.keys())) {
    if (!newPlan.steps.some((s) => s.id === id)) {
      changed.add(id);
    }
  }
  return Array.from(changed);
}

export async function editAgentPlan(opts: {
  plan: GeneratedAgentPlan;
  instruction: string;
  apiKey: string;
  resolved: ResolvedModel;
}): Promise<{ plan: GeneratedAgentPlan; changedIds: string[] }> {
  const { plan, instruction, apiKey, resolved } = opts;
  if (!apiKey) {
    throw new Error("Clé API requise pour l'édition de plan.");
  }

  const userPrompt = `Plan actuel :
${JSON.stringify(plan, null, 2)}

Instruction :
"${instruction}"

Renvoie le plan JSON complet modifié.`;

  const result = await callModel({
    provider: resolved.provider,
    model: resolved.apiModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    apiKey,
    maxTokens: 4000,
    tokenParam: resolved.tokenParam,
  });

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Le modèle n'a pas retourné de JSON valide.");
  }

  const raw = JSON.parse(jsonMatch[0]);
  const newPlan = GeneratedAgentPlanSchema.parse(raw);
  const changedIds = diffPlanIds(plan, newPlan);
  return { plan: newPlan, changedIds };
}
