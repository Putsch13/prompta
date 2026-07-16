/**
 * Libellé lisible d'une étape de manifeste — partagé client/serveur
 * (console live, API run, wizard) pour ne plus afficher « Étape N ».
 */
export interface StepLike {
  type: string;
  model?: string;
  tool?: string;
  connector?: string;
  action?: string;
  label?: string;
  source?: string;
  branches?: unknown[];
}

export function stepDisplayLabel(step: StepLike, index: number): string {
  switch (step.type) {
    case "llm":
      return `Rédaction IA (${step.model ?? "modèle"})`;
    case "tool":
      return step.tool === "web_search"
        ? "Recherche web"
        : step.tool === "http_fetch" || step.tool === "web_fetch"
          ? "Lecture d'une page web"
          : `Outil ${step.tool ?? ""}`.trim();
    case "action":
      return `${step.connector ?? "app"} → ${step.action ?? "action"}`;
    case "retrieve":
      return `Lecture ${step.source ?? "source"}`;
    case "condition":
      return "Condition";
    case "approval":
      return step.label?.trim() ? `Validation : ${step.label}` : "Validation humaine";
    case "code":
      return "Code (sandbox)";
    case "browser":
      return "Pilotage du navigateur";
    case "parallel":
      return `Étapes en parallèle (${step.branches?.length ?? 0} branches)`;
    default:
      return `Étape ${index + 1}`;
  }
}

export function plannedStepLabels(steps: StepLike[]): string[] {
  return steps.map((s, i) => stepDisplayLabel(s, i));
}
