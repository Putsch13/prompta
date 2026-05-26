/** Utilitaires pour les variables d'entrée du builder. */

const STEP_OUTPUT_RE = /^step_\d+_output$/;
const FAKE_VARS = new Set(["variable", "input", "step_N_output"]);

export function isStepOutputRef(key: string): boolean {
  return STEP_OUTPUT_RE.test(key) || key === "step_N_output";
}

export function isFakeVariable(key: string): boolean {
  return FAKE_VARS.has(key) || isStepOutputRef(key);
}

/** Extrait les variables d'entrée depuis un texte (hors références d'étapes). */
export function extractInputVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) ?? [];
  const keys = matches.map((m) => m.replace(/\{\{|\}\}/g, ""));
  return Array.from(new Set(keys.filter((k) => !isFakeVariable(k))));
}

/** Convertit une clé snake_case en label lisible. */
export function keyToLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface StepValidationIssue {
  stepIndex: number;
  message: string;
}

/** Valide les étapes LLM et les références step_X_output. */
export function validateAgentSteps(steps: { type: string; prompt?: string }[]): StepValidationIssue[] {
  const issues: StepValidationIssue[] = [];
  steps.forEach((step, i) => {
    if (step.type === "llm") {
      const prompt = step.prompt?.trim() ?? "";
      if (!prompt) {
        issues.push({ stepIndex: i, message: `Étape ${i + 1} : le prompt est vide.` });
      }
      const refs = prompt.match(/\{\{(step_\d+_output)\}\}/g) ?? [];
      for (const ref of refs) {
        const idx = parseInt(ref.match(/step_(\d+)_output/)?.[1] ?? "-1", 10);
        if (idx < 0 || idx >= i) {
          issues.push({
            stepIndex: i,
            message: `Étape ${i + 1} : référence invalide ${ref.replace(/\{\{|\}\}/g, "")}.`,
          });
        }
      }
    }
  });
  return issues;
}
