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

/**
 * Choisit la valeur d'enum la plus plausible d'après le contexte (autres
 * paramètres, id d'action). Fonction pure, testable. Fallback : 1ʳᵉ valeur.
 *
 * Un enum est un choix BORNÉ : mieux vaut choisir la valeur la plus proche du
 * contexte (ex. titre « présentation Canva » → "presentation") que planter le
 * run — c'était la cause récurrente du « design_type manquant ».
 */
export function pickEnumValue(enumValues: string[], contextText: string): string {
  const ctx = contextText
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  let best = enumValues[0];
  let bestScore = 0;
  for (const value of enumValues) {
    const v = value.toLowerCase().replace(/[_-]/g, " ");
    const tokens = v.split(/\s+/).filter((t) => t.length > 2);
    let score = 0;
    if (ctx.includes(v)) score += 10;
    for (const t of tokens) if (ctx.includes(t)) score += 5;
    // Racines FR/EN proches (presentation/présentation, document/doc…)
    for (const t of tokens) {
      const root = t.slice(0, Math.max(4, t.length - 3));
      if (root.length >= 4 && ctx.includes(root)) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }
  return best;
}

/** Complète `args` avec les défauts du schéma (fonction pure, testable). */
export function applyComposioSchemaDefaults(
  inputs: ToolInput[],
  args: Record<string, string>,
): Record<string, string> {
  const out = { ...args };
  const contextText = Object.values(args).join(" ");
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
    // Enum requis : choix BORNÉ → on choisit la valeur la plus plausible au
    // lieu d'échouer (choix unique = trivial ; multi = heuristique contexte).
    if (input.required && input.enumValues && input.enumValues.length > 0) {
      out[input.key] = pickEnumValue(input.enumValues, contextText);
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

/** Tokens alphabétiques d'une clé (snake, camel, kebab) — triés. */
function keyTokens(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join("|");
}

/**
 * Aligne les clés de params sur les clés du SCHÉMA par ensemble de tokens
 * (ordre-insensible) : `board_id` ≡ `idBoard`, `spreadsheet_id` ≡
 * `spreadsheetId`, `parent_id` ≡ `parentId`… Les plans générés écrivent en
 * snake_case « objet_id » ; chaque API a sa propre casse — une seule règle
 * couvre les 1000 apps au lieu d'alias codés en dur.
 */
export function alignParamKeysToSchema(
  inputs: ToolInput[],
  args: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...args };
  const schemaKeys = new Set(inputs.map((i) => i.key));
  const byTokens = new Map<string, string>();
  for (const i of inputs) {
    const t = keyTokens(i.key);
    if (!byTokens.has(t)) byTokens.set(t, i.key);
  }
  for (const [k, v] of Object.entries(args)) {
    if (schemaKeys.has(k) || isBlank(v)) continue;
    const target = byTokens.get(keyTokens(k));
    if (target && isBlank(out[target])) {
      out[target] = v;
      delete out[k];
    }
  }
  return out;
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

  const aligned = alignParamKeysToSchema(entry.inputs, args);
  const withDefaults = applyComposioSchemaDefaults(entry.inputs, aligned);
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
    // Cas fréquent et déroutant : parent_id Notion vide parce que la connexion
    // n'a AUCUNE page partagée avec l'intégration (choix fait pendant l'OAuth).
    const notionParentHint =
      toolSlug.startsWith("NOTION_") && missing.some((m) => /parent/i.test(m.key))
        ? " Si la recherche Notion ne renvoie aucune page : reconnecte Notion depuis Connexions et partage au moins une page ou base avec Prompta."
        : "";
    // Pas d'instruction générique ici : le hint est ajouté une seule fois par
    // error-map (sinon message dédoublé « … — Ouvrez l'étape… — Ouvrez l'étape… »).
    throw new Error(
      `missing_required_params: L'action ${toolSlug} requiert des champs non renseignés : ${list}.${notionParentHint}`,
    );
  }

  return { args: withDefaults, argTypes };
}
