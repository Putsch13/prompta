/**
 * Re-planification en cours de run (v1) — le « réparateur » de Prompta partout.
 *
 * Un plan instantané est produit AVANT l'exécution : quand une étape révèle que
 * le plan était faux (mauvais paramètre, ressource introuvable, approche à
 * revoir), on ne jette plus la mission. Le réparateur voit l'ordre initial, ce
 * qui a déjà été fait (et ne doit PAS être refait), l'étape qui a échoué et son
 * erreur, puis propose des étapes de remplacement pour la SUITE du plan.
 *
 * Garde-fous CODE (identiques au planificateur) :
 *  - validations humaines ré-insérées d'office avant toute écriture sensible ;
 *  - un plan de réparation qui exige un connecteur non connecté est refusé ;
 *  - 2 réparations max par run (plafond de coût), gérées par l'appelant.
 */

import { AgentManifestSchema, type AgentManifest } from "@/lib/agent/schema";
import { callModel } from "@/lib/llm/gateway";
import { parseLlmJson } from "@/lib/llm/json";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { canonicalConnectorKey } from "@/lib/connectors/resolve-id";
import { connectorsForSteps } from "@/lib/connectors/registry";
import { ensureApprovalGuards } from "./instant-agent";

export const MAX_REPAIRS_PER_RUN = 2;

const REPAIR_SYSTEM_PROMPT = `Tu es le RÉPARATEUR de plans de Prompta. Un agent en cours d'exécution vient d'échouer à une étape. Tu reçois : l'ordre initial de l'utilisateur, le plan complet, l'index de l'étape échouée, l'erreur exacte, et les variables déjà produites par les étapes réussies.

Ta mission : proposer des étapes de REMPLACEMENT pour la suite du plan (à partir de l'étape échouée incluse), qui contournent l'erreur et accomplissent l'objectif.

FORMAT DE SORTIE — UNIQUEMENT du JSON, sans markdown :
{"steps":[ ...étapes au même format runtime que le plan reçu... ]}
ou, si l'objectif est réellement inatteignable (information manquante côté utilisateur, service indisponible) :
{"abort":"explication courte et actionnable pour l'utilisateur"}

RÈGLES DURES :
1. NE REFAIS JAMAIS ce qui a déjà été fait : les étapes AVANT l'index échoué sont terminées, leurs variables {{…}} sont disponibles — utilise-les.
2. Ne réinvente pas la même étape à l'identique : si elle a échoué, change d'approche (autre action, autre paramètre, étape intermédiaire de recherche/extraction d'identifiant, web_search pour trouver l'info manquante…).
3. N'utilise QUE les types d'étapes du plan reçu (llm, tool web_fetch/web_search, action, approval, condition, parallel, browser) et n'invente ni URL ni identifiant. Le type browser (pilotage de l'onglet de l'utilisateur, {"type":"browser","goal":"…","outputKey":"…"}) est un DERNIER recours : uniquement si connecteurs et web_fetch ont échoué et que l'interaction avec la page affichée peut débloquer.
4. Toute écriture sensible (email, publication, CRM, e-commerce, message) reste précédée d'une étape approval.
5. La dernière étape produit la réponse/le livrable pour l'utilisateur (outputKey "reponse" pour une réponse texte).
6. 8 étapes maximum dans le remplacement.`;

export interface ReplanParams {
  goal: string;
  manifest: AgentManifest;
  failedStepIndex: number;
  errorMessage: string;
  /** Variables produites par les étapes réussies (aperçus tronqués). */
  outputs: Record<string, string>;
  modelId: string;
  apiKeys: Record<string, string>;
  usableConnectors: Set<string>;
}

export interface ReplanResult {
  kind: "repaired";
  manifest: AgentManifest;
}
export interface ReplanAbort {
  kind: "abort";
  reason: string;
}

/** Répare le plan après un échec d'étape, ou explique pourquoi c'est impossible. */
export async function replanAfterFailure(params: ReplanParams): Promise<ReplanResult | ReplanAbort | null> {
  const { goal, manifest, failedStepIndex, errorMessage, outputs, modelId, apiKeys, usableConnectors } = params;

  const resolved = resolveModelOrDefault(modelId);
  const apiKey = apiKeys[resolved.provider];
  if (!apiKey) return null;

  const failIndex = Math.min(Math.max(failedStepIndex, 0), Math.max(manifest.steps.length - 1, 0));
  const doneSteps = manifest.steps.slice(0, failIndex);
  const availableVars = Object.entries(outputs)
    .filter(([k, v]) => typeof v === "string" && v.trim() && !k.startsWith("__"))
    .map(([k, v]) => `- {{${k}}} : ${v.slice(0, 400).replace(/\s+/g, " ")}`)
    .slice(0, 30)
    .join("\n");

  const userPrompt = [
    `ORDRE INITIAL DE L'UTILISATEUR : ${goal}`,
    "",
    `PLAN COMPLET (JSON) :\n${JSON.stringify(manifest.steps)}`,
    "",
    `ÉTAPES DÉJÀ TERMINÉES : ${doneSteps.length} (index 0 à ${doneSteps.length - 1})`,
    `ÉTAPE ÉCHOUÉE : index ${failIndex} → ${JSON.stringify(manifest.steps[failIndex] ?? null)}`,
    `ERREUR EXACTE : ${errorMessage.slice(0, 800)}`,
    "",
    `VARIABLES DISPONIBLES (produites par les étapes réussies + contexte) :\n${availableVars || "(aucune)"}`,
    "",
    `Connecteurs utilisables : ${[...usableConnectors].join(", ") || "aucun"}`,
  ].join("\n");

  let content: string;
  try {
    const result = await callModel({
      provider: resolved.provider,
      model: resolved.apiModel,
      messages: [
        { role: "system", content: REPAIR_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      apiKey,
      maxTokens: 6000,
      tokenParam: resolved.tokenParam,
    });
    if (result.truncated) return null;
    content = result.content;
  } catch {
    return null;
  }

  const raw = parseLlmJson<{ steps?: unknown; abort?: unknown }>(content);
  if (typeof raw?.abort === "string" && raw.abort.trim()) {
    return { kind: "abort", reason: raw.abort.trim().slice(0, 300) };
  }
  if (!Array.isArray(raw?.steps) || raw.steps.length === 0 || raw.steps.length > 8) return null;

  // Manifeste candidat : préfixe déjà exécuté + remplacement proposé.
  const candidate = AgentManifestSchema.safeParse({
    ...manifest,
    steps: [...doneSteps, ...raw.steps],
  });
  if (!candidate.success) return null;

  // Garde-fou approvals sur la QUEUE uniquement (le préfixe est déjà exécuté,
  // y insérer une validation décalerait les index des étapes terminées).
  const tailGuarded = ensureApprovalGuards({
    ...candidate.data,
    steps: candidate.data.steps.slice(failIndex),
  });
  const repaired: AgentManifest = {
    ...candidate.data,
    steps: [...candidate.data.steps.slice(0, failIndex), ...tailGuarded.steps],
  };

  // Un plan de réparation qui exige un connecteur non connecté échouerait
  // pareil : on refuse (l'erreur d'origine reste plus claire).
  const usableNorm = new Set([...usableConnectors].map(canonicalConnectorKey));
  const needed = connectorsForSteps(repaired.steps.slice(failIndex));
  if (needed.some((c) => !usableNorm.has(canonicalConnectorKey(c)))) return null;

  return { kind: "repaired", manifest: repaired };
}
