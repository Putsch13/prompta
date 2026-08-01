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
  question?: string;
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
    case "ask":
      return step.question?.trim() ? `Question : ${step.question.slice(0, 60)}` : "Question à l'utilisateur";
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

// ── Réflexion live ───────────────────────────────────────────────────────────

/** « google_sheets » → « Google Sheets », « hubspot » → « Hubspot ». */
function appName(connector?: string | null): string {
  if (!connector) return "l'app";
  return connector
    .split(/[_-]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Verbe d'une action « <app>.<verbe_objet> » → phrase à la première personne. */
function actionThought(connector?: string | null, action?: string | null): string {
  const app = appName(connector);
  const verb = (action ?? "").split(".").pop() ?? "";
  if (/^(get|fetch|read|list|search|find|query|lookup)/i.test(verb)) return `je consulte ${app}`;
  if (/^(create|add|append|insert|import|new)/i.test(verb)) return `j'écris dans ${app}`;
  if (/^(update|edit|set|modify|rename|move|patch)/i.test(verb)) return `je mets à jour ${app}`;
  if (/^(send|post|publish|share|reply)/i.test(verb)) return `j'envoie via ${app}`;
  if (/^(delete|remove|archive|clear)/i.test(verb)) return `je nettoie dans ${app}`;
  return `j'agis dans ${app}`;
}

/**
 * RÉFLEXION à la première personne d'une étape en cours — le « à quoi je
 * pense » du panneau live, sur TOUTES les étapes (le pilotage navigateur a en
 * plus son "why" décidé par le pilote, plus précis, qui prime à l'affichage).
 * Entrée : la ligne listing_agent_run_steps (step_type + slugs + model).
 */
export function stepThought(row: {
  step_type?: string | null;
  tool_slug?: string | null;
  action_slug?: string | null;
  model?: string | null;
}): string | undefined {
  switch (row.step_type) {
    case "llm":
      return `je réfléchis et je rédige${row.model ? ` (${row.model})` : ""}`;
    case "tool":
      if (row.tool_slug === "web_search") return "je cherche sur le web";
      if (row.tool_slug === "web_fetch" || row.tool_slug === "http_fetch") return "je lis une page web";
      if (row.tool_slug === "file_read") return "je lis le fichier joint";
      return row.tool_slug ? `j'utilise l'outil ${row.tool_slug}` : undefined;
    case "action":
      // En base, action_slug = « <connecteur>.<verbe_objet> » (tool_slug est vide).
      return actionThought((row.action_slug ?? "").split(".")[0] || row.tool_slug, row.action_slug);
    case "retrieve":
      return "je consulte la source de données";
    case "browser":
      return "je pilote ton navigateur";
    case "ask":
      return "j'ai besoin d'une précision de ta part";
    case "approval":
      return "j'attends ta validation";
    case "code":
      return "j'exécute du code en sandbox";
    default:
      return undefined;
  }
}
