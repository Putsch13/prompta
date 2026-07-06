/**
 * Auto-réparation IA d'un run échoué.
 *
 * On fournit au modèle le plan d'exécution (steps) ET les erreurs réelles
 * remontées à l'exécution (code, message, aperçu d'entrées/sorties). Le modèle
 * diagnostique puis CORRIGE lui-même ce qui est réparable par édition du plan
 * (mauvais choix d'action/connecteur, mapping manquant/erroné, contenu ou nom
 * de fichier vide, placeholders non résolus, en-têtes email…).
 *
 * Garde-fous :
 * - jamais d'invention de credentials / d'ID de ressource / d'email ;
 * - tout ce qui exige une action humaine (connexion OAuth, fournir un ID/URL,
 *   partager un fichier) part dans `requiresUser` — pas dans le plan ;
 * - les `correctedSteps` sont revalidés (schéma) avant toute persistance.
 */

import { callModel } from "@/lib/llm/gateway";
import { parseLlmJson } from "@/lib/llm/json";
import type { ResolvedModel } from "@/lib/llm/resolve-model";
import type { AgentStep } from "@/lib/agent/schema";
import { AgentStepSchema } from "@/lib/agent/schema";
import type { FailedStepInfo, RunFix } from "@/lib/agent/diagnose-run";

export interface AutoFixUserAction {
  type: "connect" | "reconnect" | "resource" | "input" | "other";
  connector?: string;
  detail: string;
}

export interface AutoFixResult {
  /** Explication en français de ce qui a planté et de ce qui a été corrigé. */
  explanation: string;
  /** Liste des modifications appliquées au plan (vide si rien d'auto-réparable). */
  changes: string[];
  /** Points qui nécessitent une action de l'utilisateur (non auto-réparables). */
  requiresUser: AutoFixUserAction[];
  /** Steps corrigés validés, ou null si aucune correction de plan exploitable. */
  correctedSteps: AgentStep[] | null;
  /** Vrai si le plan a réellement été modifié de façon valide. */
  autoFixable: boolean;
}

interface FailedStepContext extends FailedStepInfo {
  inputPreview?: string | null;
  outputPreview?: string | null;
  errorDetail?: unknown;
}

const SYSTEM_PROMPT = `Tu es l'ingénieur SRE de Prompta. Tu reçois le plan d'exécution d'un agent (tableau "steps" JSON) et les ERREURS RÉELLES survenues à l'exécution.

Ta mission : diagnostiquer puis CORRIGER toi-même ce qui est réparable par modification du plan.

Tu PEUX corriger (auto-réparable) — sois AUDACIEUX, ta mission est que le prochain run RÉUSSISSE :
- un mauvais choix d'action/outil/connecteur ;
- un mapping de paramètres manquant ou erroné (ex. nom de fichier vide, contenu non câblé sur la sortie d'une étape amont via {{outputKey}}) ;
- un paramètre requis manquant dont le SCHÉMA fourni donne les valeurs possibles : CHOISIS la valeur d'enum la plus adaptée au contexte, ou le default ;
- un paramètre texte requis manquant : ajoute un "aiFills" sur l'étape ({"cle": {"model": "gpt-5.4-mini", "prompt": "..."}}) pour le générer au run ;
- la REQUÊTE d'une étape retrieve qui ne trouve rien : reformule-la (mots-clés du vrai nom de fichier visibles dans le plan, ou intention « fichiers récents ») ;
- un placeholder {{...}} qui ne pointe vers aucune sortie existante ;
- un en-tête email invalide (from/to) quand la valeur correcte est déductible du plan ;
- une plage/onglet Sheets invalide (utilise "A1" par défaut) ;
- l'ordre/branchement des étapes.

Tu NE corriges JAMAIS (→ requiresUser) :
- une connexion/autorisation OAuth d'un service (connect/reconnect) ;
- la fourniture d'un ID ou d'une URL de ressource précise (un Sheet/Doc/Drive précis) ;
- le partage d'un fichier avec le compte connecté.

Interdits absolus : n'invente jamais de credentials, d'ID de ressource, d'adresse email, ni de valeur secrète.

Contraintes de plan :
- préserve les "id" et "outputKey" des étapes existantes ;
- garde un plan cohérent et exécutable ;
- ne touche qu'aux étapes nécessaires.

Réponds UNIQUEMENT avec un objet JSON, sans markdown :
{
  "explanation": "résumé clair en français de ce qui a planté et de ce que tu corriges",
  "changes": ["modif 1 appliquée au plan", "..."],
  "requiresUser": [{ "type": "connect|reconnect|resource|input|other", "connector": "slug optionnel", "detail": "ce que l'utilisateur doit faire" }],
  "autoFixable": true,
  "correctedSteps": [ /* tableau COMPLET des steps corrigés, même format que l'entrée */ ]
}

Si aucune correction de plan n'est possible (uniquement des actions utilisateur), mets "autoFixable": false et "correctedSteps": null.`;

interface RawAutoFix {
  explanation?: unknown;
  changes?: unknown;
  requiresUser?: unknown;
  autoFixable?: unknown;
  correctedSteps?: unknown;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function asUserActions(v: unknown): AutoFixUserAction[] {
  if (!Array.isArray(v)) return [];
  const out: AutoFixUserAction[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const detail = typeof o.detail === "string" ? o.detail : "";
    if (!detail.trim()) continue;
    const type = ["connect", "reconnect", "resource", "input", "other"].includes(
      String(o.type),
    )
      ? (o.type as AutoFixUserAction["type"])
      : "other";
    out.push({
      type,
      connector: typeof o.connector === "string" ? o.connector : undefined,
      detail,
    });
  }
  return out;
}

/** Valide les steps proposés : chaque step doit passer le schéma, sinon on rejette tout. */
function validateCorrectedSteps(v: unknown): AgentStep[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const parsed: AgentStep[] = [];
  for (const step of v) {
    const res = AgentStepSchema.safeParse(step);
    if (!res.success) return null;
    parsed.push(res.data);
  }
  return parsed;
}

function buildUserPrompt(
  steps: AgentStep[],
  failed: FailedStepContext[],
  fixes: RunFix[],
): string {
  const failedBlock = failed
    .map((f) => {
      const lines = [
        `- Étape #${f.stepIndex}${f.label ? ` (${f.label})` : ""}`,
        `  code: ${f.errorCode ?? "—"}`,
        `  message: ${f.errorMessage ?? "—"}`,
      ];
      if (f.actionSlug || f.toolSlug)
        lines.push(`  action/outil: ${f.actionSlug ?? f.toolSlug}`);
      if (f.connector) lines.push(`  connecteur: ${f.connector}`);
      if (f.inputPreview)
        lines.push(`  entrées (aperçu): ${String(f.inputPreview).slice(0, 800)}`);
      if (f.outputPreview)
        lines.push(`  sortie (aperçu): ${String(f.outputPreview).slice(0, 800)}`);
      return lines.join("\n");
    })
    .join("\n");

  const diag = fixes
    .map((x) => `- [${x.kind}] ${x.title} — ${x.detail}`)
    .join("\n");

  return `Plan d'exécution actuel (steps) :
${JSON.stringify(steps, null, 2)}

Erreurs réelles survenues :
${failedBlock || "(aucune étape en échec listée)"}

Pré-diagnostic déterministe (à confirmer/affiner) :
${diag || "(aucun)"}

Diagnostique et corrige le plan comme demandé, puis renvoie le JSON.`;
}

export interface ToolSchemaContext {
  action: string;
  inputs: Array<{
    key: string;
    label: string;
    required: boolean;
    enumValues?: string[];
    defaultValue?: string;
  }>;
}

export async function autoFixRun(opts: {
  steps: AgentStep[];
  failed: FailedStepContext[];
  fixes: RunFix[];
  apiKey: string;
  resolved: ResolvedModel;
  /** Schémas RÉELS des outils en échec (enums, requis, défauts). */
  toolSchemas?: ToolSchemaContext[];
}): Promise<AutoFixResult> {
  const { steps, failed, fixes, apiKey, resolved, toolSchemas } = opts;

  const schemaBlock = toolSchemas?.length
    ? `\n\nSCHÉMAS RÉELS des outils en échec (utilise CES clés/valeurs, choisis dans les enums) :\n${JSON.stringify(toolSchemas)}`
    : "";

  const result = await callModel({
    provider: resolved.provider,
    model: resolved.apiModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(steps, failed, fixes) + schemaBlock },
    ],
    apiKey,
    maxTokens: 8000,
    tokenParam: resolved.tokenParam,
  });

  const raw = parseLlmJson<RawAutoFix>(result.content);
  if (!raw) {
    if (result.truncated) {
      throw new Error(
        "La réponse de l'IA a été tronquée. Réessayez ou simplifiez l'agent.",
      );
    }
    throw new Error("L'IA n'a pas retourné de diagnostic exploitable.");
  }

  const explanation =
    typeof raw.explanation === "string" && raw.explanation.trim()
      ? raw.explanation.trim()
      : "Diagnostic indisponible.";
  const requiresUser = asUserActions(raw.requiresUser);
  const correctedSteps = validateCorrectedSteps(raw.correctedSteps);

  // autoFixable = le modèle l'affirme ET les steps sont valides ET réellement différents.
  const changed =
    correctedSteps !== null &&
    JSON.stringify(correctedSteps) !== JSON.stringify(steps);
  const autoFixable = raw.autoFixable === true && changed;

  return {
    explanation,
    changes: autoFixable ? asStringArray(raw.changes) : [],
    requiresUser,
    correctedSteps: autoFixable ? correctedSteps : null,
    autoFixable,
  };
}
