/**
 * Copilote de construction — GPT qui accompagne l'utilisateur ÉTAPE PAR ÉTAPE.
 *
 * Contrairement au calcul déterministe de complétude (agent-readiness.ts), le
 * copilote mène une vraie réflexion : il prend une tâche à la fois, pose une
 * question concrète, puis met à jour le plan à partir de la réponse. Il s'arrête
 * quand toutes les étapes sont réellement finalisées.
 */

import { callModel } from "@/lib/llm/gateway";
import { parseLlmJson } from "@/lib/llm/json";
import type { ResolvedModel } from "@/lib/llm/resolve-model";
import { parseGeneratedAgentPlan, type GeneratedAgentPlan } from "./generate-agent-plan";
import { diffPlanIds } from "./edit-agent-plan";

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CopilotContext {
  /** Modèles IA réellement disponibles (id catalogue + libellé). */
  models: { id: string; label: string; provider?: string }[];
  /** Connecteurs connectés (avec compte si connu) — pas besoin de reconnexion. */
  connectedConnectors: { id: string; account?: string }[];
  /** Connecteurs utilisés par le plan mais NON connectés (à connecter d'abord). */
  disconnectedConnectors: string[];
  /** Manques réels par nœud (calcul déterministe), pour cibler les questions. */
  gaps: {
    nodeId: string;
    name: string;
    kind: string;
    missing: { key: string; label: string; kind: string; resourceType?: string }[];
  }[];
}

export interface CopilotTurnResult {
  assistant: string;
  awaitingUser: boolean;
  done: boolean;
  focusStepId?: string;
  completedStepIds: string[];
  plan?: GeneratedAgentPlan;
  changedIds: string[];
}

const SYSTEM_PROMPT = `Tu es le COPILOTE de construction d'agents IA de Prompta.
Tu accompagnes l'utilisateur (souvent non technique) pour FINALISER son agent, ÉTAPE PAR ÉTAPE,
avec une VRAIE réflexion (pas de questions génériques, pas de "tout est prêt" automatique).

Méthode :
1. Traite UNE seule étape (step) à la fois, dans l'ordre du plan, en partant de la première étape non finalisée.
2. Avant de parler, RAISONNE sur l'étape courante à partir du CONTEXTE fourni
   (manques réels, connexions, modèles dispo). Identifie ce qui lui manque concrètement :
   - une étape ACTION : connecteur/action à préciser, connexion à établir, ressource à choisir
     (ex. quel fichier Drive / quelle feuille / quelle base), et chaque paramètre requis.
   - une étape ANALYSE/LLM : la "peau" que l'agent doit endosser (rôle/persona : commercial, marketing,
     SEO, financier, juridique, data analyst…), le contexte métier, le but, le format de sortie,
     ET quel modèle IA utiliser (propose un choix parmi les modèles dispo, ex. GPT-5.x vs Claude Sonnet).
   - une condition : l'expression à évaluer.
3. Pose UNE question précise et intelligente à la fois, ancrée dans CE que fait l'étape.
   Mauvais : « Quelle valeur pour ce paramètre ? ». Bon : « Quelle base de données du Drive dois-je
   auditer ? » ou « Dans quelle casquette dois-je analyser : commercial, financier ou SEO ? ».
   Pour un paramètre, propose les 3 options : valeur FIXE, DEMANDER à l'abonné, ou GÉNÉRÉE par IA.
4. Quand tu as l'info, METS À JOUR le plan (champ "plan" = plan complet), ajoute l'id de l'étape à
   "completedStepIds", puis passe à l'étape suivante en posant sa question.
5. Quand TOUTES les étapes sont finalisées, mets "done": true et annonce que c'est prêt à tester.

Comment intégrer les réponses au plan — RÈGLE CLÉ :
- Quand l'utilisateur te donne une valeur CONCRÈTE (un contexte, un texte, une URL, un ID, un choix),
  ÉCRIS-LA TELLE QUELLE (valeur littérale) dans "inputMapping" du paramètre concerné.
  → Ces valeurs figées sont utilisées directement et NE seront PAS redemandées au lancement du test.
  → N'invente PAS de variable {{...}} pour une valeur que l'utilisateur vient de te donner.
- N'utilise une variable {{snake_case}} (+ déclaration dans "variables") QUE si la valeur doit être
  fournie DIFFÉREMMENT par chaque abonné à chaque exécution. Dans ce cas, dis-le clairement
  à l'utilisateur (« ce champ sera demandé à chaque utilisation »).
- Persona/rôle + contexte d'analyse → réécris la "description" de l'étape LLM en une consigne riche
  (rôle, objectif, ton, format), en référençant les sorties amont {{outputKey}} et docs/ressources.
- Choix de modèle pour une étape LLM → renseigne le champ "model" de cette étape avec l'id catalogue exact.
- Ressource (fichier, feuille, base, canal…) :
  • si l'utilisateur te donne l'URL/ID → écris-le littéralement dans "inputMapping" ;
  • s'il ne connaît pas l'ID → demande-lui de la CHOISIR dans le sélecteur de ressources sous le chat,
    et NE passe pas à l'étape suivante / NE mets pas "done" tant que ce n'est pas fait.
- Contenu rédactionnel (objet, corps, slides) → crée si besoin une étape LLM amont qui le produit.
- Connecteur listé comme "à connecter" dans le contexte → demande d'abord de le connecter
  (bouton sous le chat) avant de configurer. S'il est déjà connecté, n'en parle pas.
- Action qui écrit/envoie → riskLevel "high" et requiresApproval true. Préserve les ids non concernés.
- Ne mets JAMAIS de fausses valeurs (email, nom, clé) inventées en dur — uniquement ce que l'utilisateur a fourni.

Format de SORTIE — réponds UNIQUEMENT avec un JSON strict, sans markdown :
{
  "assistant": "ta question / ton message (français, concis, chaleureux, concret)",
  "awaitingUser": true | false,        // true si tu attends une réponse avant de continuer
  "focusStepId": "id de l'étape en cours",
  "completedStepIds": ["ids des étapes déjà finalisées"],
  "done": false,
  "plan": null | { plan complet mis à jour }
}
Mets "plan" à null si tu n'as rien modifié à ce tour (simple question).`;

function renderContext(ctx: CopilotContext): string {
  const models = ctx.models.map((m) => `${m.id} (${m.label})`).join(", ");
  const connected =
    ctx.connectedConnectors.length > 0
      ? ctx.connectedConnectors
          .map((c) => (c.account ? `${c.id} [${c.account}]` : c.id))
          .join(", ")
      : "aucun";
  const disconnected =
    ctx.disconnectedConnectors.length > 0 ? ctx.disconnectedConnectors.join(", ") : "aucun";
  const gaps =
    ctx.gaps.length > 0
      ? ctx.gaps
          .map(
            (g) =>
              `- ${g.nodeId} « ${g.name} » (${g.kind}) → manque : ${
                g.missing.length > 0
                  ? g.missing
                      .map(
                        (m) =>
                          `${m.label} [${m.kind}${m.resourceType ? `:${m.resourceType}` : ""}]`,
                      )
                      .join(", ")
                  : "rien (déjà OK)"
              }`,
          )
          .join("\n")
      : "(aucun nœud)";
  return `CONTEXTE RÉEL (sers-t'en pour des questions intelligentes) :
Modèles IA disponibles : ${models}
Connecteurs connectés : ${connected}
Connecteurs à connecter : ${disconnected}
Manques par étape (calcul déterministe) :
${gaps}`;
}

export async function runCopilotTurn(opts: {
  plan: GeneratedAgentPlan;
  messages: CopilotMessage[];
  apiKey: string;
  resolved: ResolvedModel;
  context?: CopilotContext;
}): Promise<CopilotTurnResult> {
  const { plan, messages, apiKey, resolved, context } = opts;
  if (!apiKey) throw new Error("Clé API requise pour le copilote.");

  const llmMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(context ? [{ role: "user" as const, content: renderContext(context) }] : []),
    { role: "user", content: `Plan actuel (JSON) :\n${JSON.stringify(plan)}` },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  if (messages.length === 0) {
    llmMessages.push({
      role: "user",
      content:
        "Démarre l'accompagnement : prends la première étape à finaliser et pose-moi ta première question. Réponds en JSON.",
    });
  } else {
    llmMessages.push({ role: "user", content: "(Produis le prochain tour en JSON strict.)" });
  }

  const result = await callModel({
    provider: resolved.provider,
    model: resolved.apiModel,
    messages: llmMessages,
    apiKey,
    maxTokens: 4000,
    tokenParam: resolved.tokenParam,
  });

  type RawTurn = {
    assistant?: string;
    awaitingUser?: boolean;
    done?: boolean;
    focusStepId?: string;
    completedStepIds?: string[];
    plan?: unknown;
  };

  let raw = parseLlmJson<RawTurn>(result.content);

  // Relance de réparation : on redemande au modèle de renvoyer un JSON valide.
  if (!raw) {
    try {
      const fix = await callModel({
        provider: resolved.provider,
        model: resolved.apiModel,
        messages: [
          {
            role: "system",
            content:
              "Tu corriges du JSON invalide. Renvoie UNIQUEMENT un objet JSON valide, sans texte ni markdown.",
          },
          { role: "user", content: result.content },
        ],
        apiKey,
        maxTokens: 4000,
        tokenParam: resolved.tokenParam,
      });
      raw = parseLlmJson<RawTurn>(fix.content);
    } catch {
      raw = null;
    }
  }

  if (!raw) {
    throw new Error("Le copilote a renvoyé une réponse mal formée. Réessayez.");
  }

  let newPlan: GeneratedAgentPlan | undefined;
  let changedIds: string[] = [];
  if (raw.plan && typeof raw.plan === "object") {
    try {
      newPlan = parseGeneratedAgentPlan(raw.plan);
      changedIds = diffPlanIds(plan, newPlan);
    } catch {
      newPlan = undefined;
    }
  }

  return {
    assistant: String(raw.assistant ?? "").trim() || "…",
    awaitingUser: raw.awaitingUser !== false,
    done: !!raw.done,
    focusStepId: typeof raw.focusStepId === "string" ? raw.focusStepId : undefined,
    completedStepIds: Array.isArray(raw.completedStepIds)
      ? raw.completedStepIds.filter((x): x is string => typeof x === "string")
      : [],
    plan: newPlan,
    changedIds,
  };
}
