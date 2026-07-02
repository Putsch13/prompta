/**
 * Garde GÉNÉRIQUE des paramètres d'outils Composio — pour les 300+ toolkits,
 * sans code par app.
 *
 * Avant chaque exécution :
 * 1. remplit les champs absents avec le `default` du JSON-schema de l'outil,
 *    ou l'unique valeur d'un enum à un seul choix ;
 * 2. vérifie les champs requis restants et échoue AVANT l'appel provider avec
 *    un message actionnable (au lieu du cryptique « Invalid request data
 *    provided — Following fields are missing: {...} » de Composio).
 *
 * Best-effort : si le schéma de l'outil est indisponible (catalogue en échec),
 * on n'invente pas de blocage — l'appel part et l'erreur provider sera mappée.
 */

import { listComposioTools, type ComposioToolEntry } from "./catalog";
import type { ComposioArgType } from "./execute";

type ToolInput = ComposioToolEntry["inputs"][number];

/** Type JSON-schema brut → type de coercition d'exécution. */
export function argTypeFromRaw(rawType?: string): ComposioArgType | undefined {
  switch (rawType) {
    case "array":
      return "array";
    case "object":
      return "object";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    default:
      return undefined;
  }
}

function isBlank(v: string | undefined): boolean {
  return v === undefined || v === null || String(v).trim() === "";
}

/** Complète `args` avec les défauts du schéma (fonction pure, testable). */
export function applyComposioSchemaDefaults(
  inputs: ToolInput[],
  args: Record<string, string>,
): Record<string, string> {
  const out = { ...args };
  for (const input of inputs) {
    // Troncature selon le maxLength du schéma : une valeur trop longue (ex.
    // titre généré par IA > 255 chars) ferait rejeter TOUTE l'action par le
    // provider — mieux vaut couper proprement que planter le run.
    const current = out[input.key];
    if (
      input.maxLength &&
      typeof current === "string" &&
      current.length > input.maxLength
    ) {
      out[input.key] = current.slice(0, Math.max(1, input.maxLength - 1)).trimEnd() + "…";
    }
    if (!isBlank(out[input.key])) continue;
    if (input.defaultValue !== undefined) {
      out[input.key] = input.defaultValue;
      continue;
    }
    // Enum à choix unique : il n'y a rien à décider.
    if (input.required && input.enumValues?.length === 1) {
      out[input.key] = input.enumValues[0];
    }
  }
  return out;
}

/** Champs requis toujours vides après défauts (fonction pure, testable). */
export function missingRequiredComposioParams(
  inputs: ToolInput[],
  args: Record<string, string>,
): ToolInput[] {
  return inputs.filter((i) => i.required && isBlank(args[i.key]));
}

export interface GuardResult {
  args: Record<string, string>;
  /** Types attendus par le schéma (clé → type) pour la coercition d'exécution. */
  argTypes?: Record<string, ComposioArgType>;
}

/**
 * Applique défauts + validation pour `toolSlug`. Jette une erreur claire
 * (avec la liste des champs et leurs libellés) si des requis manquent.
 */
export async function guardComposioParams(
  toolkitSlug: string,
  toolSlug: string,
  args: Record<string, string>,
): Promise<GuardResult> {
  let entry: ComposioToolEntry | undefined;
  try {
    const tools = await listComposioTools(toolkitSlug);
    entry = tools.find((t) => t.slug === toolSlug);
  } catch {
    // Catalogue indisponible → pas de blocage inventé, l'appel tranchera.
    return { args };
  }
  if (!entry) return { args };

  const withDefaults = applyComposioSchemaDefaults(entry.inputs, args);
  const missing = missingRequiredComposioParams(entry.inputs, withDefaults);

  const argTypes: Record<string, ComposioArgType> = {};
  for (const input of entry.inputs) {
    const t = argTypeFromRaw(input.rawType);
    if (t) argTypes[input.key] = t;
  }

  if (missing.length > 0) {
    const list = missing
      .map((m) => {
        const choices = m.enumValues?.length
          ? ` (choix : ${m.enumValues.slice(0, 6).join(", ")}${m.enumValues.length > 6 ? "…" : ""})`
          : "";
        return `« ${m.label} » (${m.key})${choices}`;
      })
      .join(", ");
    throw new Error(
      `missing_required_params: L'action ${toolSlug} requiert des champs non renseignés : ${list}. ` +
        `Ouvrez l'étape dans le builder et renseignez-les (valeur fixe, « Demander à l'abonné » ou « Générer par IA »).`,
    );
  }

  return { args: withDefaults, argTypes };
}
