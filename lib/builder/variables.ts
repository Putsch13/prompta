/** Utilitaires pour les variables d'entrée du builder. */

const STEP_OUTPUT_RE = /^step_\d+_output(\.|$)/;
const FAKE_VARS = new Set(["variable", "input", "step_N_output"]);

export function isStepOutputRef(key: string): boolean {
  return STEP_OUTPUT_RE.test(key) || key === "step_N_output";
}

export function isFakeVariable(key: string): boolean {
  return FAKE_VARS.has(key) || isStepOutputRef(key);
}

/** Extrait les variables d'entrée depuis un texte (hors références d'étapes). Supporte {{customer.email}}. */
export function extractInputVariables(text: string): string[] {
  const re = /\{\{([\w.]+)\}\}/g;
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    keys.push(m[1]);
  }
  return Array.from(new Set(keys.filter((k) => !isFakeVariable(k) && !isStepOutputRef(k))));
}

/** Extrait les variables d'entrée depuis un tableau d'étapes (parcours récursif des branches parallèles). */
export function extractInputVariablesFromSteps(steps: { type: string; prompt?: string; source?: string; query?: string; expression?: string; params?: Record<string, string>; branches?: { steps: unknown[]; outputKey?: string }[] }[]): string[] {
  const allVars = new Set<string>();
  for (const step of steps) {
    const texts: string[] = [];
    if (step.type === "parallel" && step.branches) {
      for (const branch of step.branches) {
        const branchVars = extractInputVariablesFromSteps(branch.steps as typeof steps);
        branchVars.forEach((v) => allVars.add(v));
      }
      continue;
    }
    if (step.prompt) texts.push(step.prompt);
    if (step.source) texts.push(step.source);
    if (step.query) texts.push(step.query);
    if (step.expression) texts.push(step.expression);
    if (step.params) texts.push(...Object.values(step.params));
    for (const text of texts) {
      for (const v of extractInputVariables(text)) {
        allVars.add(v);
      }
    }
  }
  return Array.from(allVars);
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

/** Valide les étapes LLM et les références step_X_output (parcours récursif des branches parallèles). */
export function validateAgentSteps(steps: { type: string; prompt?: string; branches?: { steps: { type: string; prompt?: string }[] }[] }[]): StepValidationIssue[] {
  const issues: StepValidationIssue[] = [];
  steps.forEach((step, i) => {
    if (step.type === "parallel" && step.branches) {
      for (let b = 0; b < step.branches.length; b++) {
        const branchIssues = validateAgentSteps(step.branches[b].steps);
        for (const issue of branchIssues) {
          issues.push({
            stepIndex: i,
            message: `Étape ${i + 1} (branche ${b + 1}) : ${issue.message}`,
          });
        }
      }
      return;
    }
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
