/**
 * Source unique de vérité pour l'index d'étape et la clé d'un paramètre.
 *
 * Tous les modules qui parlent d'une étape (orchestrateur, extract-run-resources,
 * deriveInterface, résolveur, UI) doivent **utiliser ces helpers** plutôt que
 * de recalculer l'index. Cela garantit qu'un placeholder demandé dans le masque
 * est lu au bon endroit côté serveur, branches parallèles incluses.
 *
 * Référence : REFONTE-prompta-runtime.md — Pilier C (Runtime).
 */

import type { AgentStep, BaseAgentStep } from "@/lib/agent/schema";

/**
 * Index global d'une sous-étape parallèle : `idx * 100 + branchIdx * 10 + s`.
 * Le facteur 100 garantit qu'on ne collisionne pas avec les étapes top-level
 * tant que le nombre d'étapes < 100 (toujours vrai en pratique : `max_steps`
 * plafonne autour de 20).
 */
export function parallelSubIndex(
  topLevelIdx: number,
  branchIdx: number,
  stepInBranchIdx: number,
): number {
  return topLevelIdx * 100 + branchIdx * 10 + stepInBranchIdx;
}

/** Clé canonique pour `{{resource:…}}` et autres params d'étape. */
export function stepKey(stepIndex: number, paramKey: string): string {
  return `${stepIndex}:${paramKey}`;
}

/** Régexp pour reconnaître une clé `stepIndex:paramKey`. */
export const STEP_KEY_RE = /^\d+:\w+$/;

export function isStepKey(value: string): boolean {
  return STEP_KEY_RE.test(value);
}

export function parseStepKey(value: string): { stepIndex: number; paramKey: string } | null {
  const m = value.match(/^(\d+):(\w+)$/);
  if (!m) return null;
  return { stepIndex: Number(m[1]), paramKey: m[2] };
}

// ─── Walk avec index ─────────────────────────────────────────────────────────

export interface WalkedStep {
  step: BaseAgentStep;
  stepIndex: number;
  /** Position originale dans la liste top-level (0-based). */
  topLevelIdx: number;
  /** Si l'étape est dans un parallel, position dans la branche. */
  parallel?: { branchIdx: number; stepInBranchIdx: number };
}

/**
 * Parcours récursif unifié. Renvoie chaque étape « exécutable » (non parallel)
 * avec son index global identique à celui de l'orchestrateur.
 *
 * À utiliser dans :
 *  - `lib/agent/contract.ts` (deriveInterface)
 *  - `lib/connectors/extract-run-resources.ts`
 *  - tout endroit qui doit calculer `stepIndex:paramKey`
 */
export function walkWithIndex(steps: AgentStep[]): WalkedStep[] {
  const out: WalkedStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === "parallel") {
      for (let b = 0; b < step.branches.length; b++) {
        const branch = step.branches[b];
        for (let s = 0; s < branch.steps.length; s++) {
          const sub = branch.steps[s] as BaseAgentStep;
          out.push({
            step: sub,
            stepIndex: parallelSubIndex(i, b, s),
            topLevelIdx: i,
            parallel: { branchIdx: b, stepInBranchIdx: s },
          });
        }
      }
      continue;
    }
    out.push({ step: step as BaseAgentStep, stepIndex: i, topLevelIdx: i });
  }
  return out;
}
