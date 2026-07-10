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
  /** TOUS les connecteurs déjà connectés du compte (pas seulement ceux du plan). */
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
3bis. ANTI-REDONDANCE (règle dure) : ne repose JAMAIS une question dont la réponse figure déjà
   dans le plan, le contexte ou un message précédent — même formulée autrement. Si une réponse
   couvre plusieurs étapes (ex. le même dossier Drive sert à 2 étapes), applique-la PARTOUT
   d'un coup et dis-le. Avant chaque question, demande-toi : « est-ce que je le sais déjà ? ».
   Si oui, mets à jour le plan sans questionner. Deux questions quasi identiques = une seule.
3quater. JAMAIS DE SUSPENSE (règle dure) : ne termine JAMAIS ton tour sur une annonce d'action
   (« je renseigne X et je passe à Y », « tout est prêt, je lance Z »). Si tu annonces une
   action, FAIS-LA DANS CE MÊME TOUR : mets à jour "plan", coche "completedStepIds", et
   enchaîne DIRECTEMENT sur la prochaine vraie question — ou mets "done": true s'il n'y a
   plus rien à demander. L'utilisateur ne doit JAMAIS avoir à répondre « ok » ou « vas-y »
   pour te débloquer. Un tour se termine soit par une QUESTION précise ("awaitingUser": true),
   soit par "done": true. Rien d'autre.
3ter. CONNEXIONS : si une étape utilise une app non connectée (voir contexte connexions),
   signale-le UNE fois : « Connecte {app} via le panneau sous le chat (bouton Se connecter),
   je continue pendant ce temps » — puis passe aux questions suivantes sans bloquer.
4. Quand tu as l'info, METS À JOUR le plan (champ "plan" = plan complet), ajoute l'id de l'étape à
   "completedStepIds", puis passe à l'étape suivante en posant sa question.
5. SOURCES DE CONNAISSANCE (RAG) : si l'agent doit analyser, auditer ou rédiger à partir d'un
   corpus (documents, dossier Drive, base Notion, feuille, page web), demande EXPLICITEMENT au
   tout début : « Veux-tu enrichir le savoir de l'agent avec des fichiers / un dossier Drive /
   une base (RAG) ? ». Si OUI, ajoute une étape de type "retrieve" en AMONT des étapes d'analyse,
   avec "dataSource" (file_upload | google_drive | notion | google_sheets | url | hubspot | gmail)
   et "query" (ce qu'il faut récupérer). Pour file_upload, demande à l'utilisateur d'uploader le(s)
   fichier(s) dans « Base de connaissances » sous le chat et de coller l'ID document dans "query".
   Référence ensuite la sortie {{outputKey}} de l'étape retrieve dans les étapes d'analyse.
6. Quand TOUTES les étapes sont finalisées, mets "done": true et annonce que c'est prêt à tester.
7. INTÉGRATION DES RÉPONSES (règle dure) : quand l'utilisateur vient de répondre à une question,
   ce tour DOIT renvoyer "plan" mis à jour intégrant sa réponse (description enrichie, inputMapping,
   model…). Recevoir une réponse et renvoyer "plan": null est une ERREUR — l'arborescence doit
   refléter chaque information donnée.
8bis. RECENSEMENT EXHAUSTIF : si l'objectif demande de recenser « tous/toutes » les X d'une zone,
   UNE recherche web ne suffit jamais (≈10 résultats). Structure un ÉVENTAIL : plusieurs étapes
   web_search segmentées (par métier × par ville/zone), chacune avec "inputMapping": {"query": "…", "num": "30"},
   puis une extraction par segment et une fusion/déduplication. Dis honnêtement à l'utilisateur que
   l'exhaustivité totale dépend des sources publiques.
8. PAS DE COMPLÉTION HÂTIVE (règle dure) : n'ajoute une étape à "completedStepIds" QUE si le plan
   contient déjà TOUTES ses infos (paramètres requis remplis, consigne LLM enrichie avec rôle +
   format de sortie, ressource choisie). Ne saute JAMAIS une étape qui a encore un manque listé
   dans le contexte. Mieux vaut une question de plus qu'un agent mal configuré.

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
- Ressource (fichier, feuille, base, canal…) — NE demande JAMAIS un « ID » brut (trop technique) :
  • propose D'ABORD : « Tu préfères que l'agent CRÉE la feuille/le doc lui-même à chaque mission,
    ou utiliser un existant ? » — s'il choisit la création, AJOUTE une étape amont
    (ex. google_sheets.create_spreadsheet) + une étape LLM d'extraction d'id, et câble
    {{outputKey}} dans le paramètre ;
  • s'il veut un existant → demande-lui de le CHOISIR dans le sélecteur de ressources sous le chat
    ou de COLLER L'URL complète (jamais « donne-moi l'ID »), et NE mets pas "done" tant que ce n'est pas fait.
- Contenu rédactionnel (objet, corps, slides) → crée si besoin une étape LLM amont qui le produit.
- CONNEXIONS : la liste "Connecteurs connectés" recense TOUS les comptes déjà reliés
  (même s'ils ne sont pas encore dans le plan). Un connecteur qui y figure est DÉJÀ
  connecté : ne demande JAMAIS de le (re)connecter, même pour un nouveau nœud — ajoute
  directement le nœud. Ne demande de connecter QUE les connecteurs listés "à connecter".
  Compare en ignorant casse/séparateurs (gmail = Gmail = google_mail).
- Action qui écrit/envoie → riskLevel "high" et requiresApproval true. Préserve les ids non concernés.
- Ne mets JAMAIS de fausses valeurs (email, nom, clé) inventées en dur — uniquement ce que l'utilisateur a fourni.

AJOUT / MODIFICATION DE TÂCHES (RÈGLE CRITIQUE — ne l'ignore jamais) :
- Si l'utilisateur DEMANDE d'ajouter, insérer ou dupliquer une ou plusieurs tâches/étapes,
  tu DOIS renvoyer "plan" avec le(s) nouveau(x) nœud(s) AJOUTÉ(S) dès ce tour. Ne renvoie
  JAMAIS "plan": null quand on te demande d'ajouter/modifier une étape.
- Crée chaque nouveau nœud avec un "id" UNIQUE en snake_case (qui n'existe pas déjà), le bon
  "type"/"connectorId"/"actionSlug" ou "model", et câble-le via "next" (insère-le au bon endroit
  et fais pointer le nœud amont vers lui). Préserve tous les ids existants.
- N'interroge pas à l'infini : ajoute le nœud TOUT DE SUITE avec des valeurs raisonnables
  déduites de la demande, puis pose AU PLUS une question pour le détail vraiment indispensable
  — mais renvoie quand même le "plan" avec le nœud déjà ajouté. Mieux vaut un nœud à affiner
  qu'aucun nœud.
- PARALLÈLE : pour exécuter plusieurs tâches EN MÊME TEMPS (ex. publier sur plusieurs réseaux,
  analyser plusieurs sources), crée plusieurs nœuds et fais pointer le "next" du nœud amont
  commun vers TOUS ces nœuds (next = liste de plusieurs ids) ; ils s'exécutent en parallèle.
  Pour réunir leurs résultats, fais converger leurs "next" vers un nœud aval commun.
- Après ajout, dis brièvement dans "assistant" ce que tu as ajouté (« J'ai ajouté l'étape X
  en parallèle de Y »).

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
  let planParseError: string | null = null;
  if (raw.plan && typeof raw.plan === "object") {
    try {
      newPlan = parseGeneratedAgentPlan(raw.plan);
      changedIds = diffPlanIds(plan, newPlan);
    } catch (err) {
      // Le copilote a renvoyé un plan mais il n'a pas passé la validation —
      // on le trace (ne plus l'avaler silencieusement : c'était la cause des
      // « il pose des questions mais n'ajoute jamais le nœud »).
      planParseError = err instanceof Error ? err.message : String(err);
      console.error("[copilot] plan renvoyé invalide (nœud non ajouté) :", planParseError);
      newPlan = undefined;
    }
  }

  // GARDE : l'utilisateur a demandé une modification (ajout/suppression/changement
  // d'étape) mais le tour ne renvoie pas de plan exploitable → UNE relance
  // corrective. Sans ça, le copilote « dit » qu'il a ajouté la tâche sans que
  // l'arborescence ne bouge.
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const asksModification =
    /\b(ajoute|rajoute|ajouter|insère|insérer|crée|créer|supprime|retire|enlève|remplace|modifie|change|déplace|duplique)\b/i.test(
      lastUser,
    ) && /\b(étape|etape|tâche|tache|nœud|noeud|node|step|action|analyse|envoi|branche)\b/i.test(lastUser);
  if (!newPlan && asksModification) {
    try {
      const retry = await callModel({
        provider: resolved.provider,
        model: resolved.apiModel,
        messages: [
          ...llmMessages,
          { role: "assistant", content: result.content },
          {
            role: "user",
            content: `${
              planParseError
                ? `Ton plan n'a pas passé la validation (${planParseError}). `
                : "Tu n'as PAS renvoyé le plan mis à jour alors que je t'ai demandé une modification d'étape. "
            }Renvoie MAINTENANT le JSON strict complet avec "plan" contenant le plan ENTIER mis à jour (nouveaux nœuds inclus, ids existants préservés, "next" câblés). Aucun texte hors JSON.`,
          },
        ],
        apiKey,
        maxTokens: 4000,
        tokenParam: resolved.tokenParam,
      });
      const retryRaw = parseLlmJson<RawTurn>(retry.content);
      if (retryRaw?.plan && typeof retryRaw.plan === "object") {
        try {
          newPlan = parseGeneratedAgentPlan(retryRaw.plan);
          changedIds = diffPlanIds(plan, newPlan);
          raw = { ...retryRaw, assistant: retryRaw.assistant ?? raw.assistant };
        } catch (err) {
          console.error(
            "[copilot] relance corrective : plan encore invalide :",
            err instanceof Error ? err.message : err,
          );
        }
      }
    } catch {
      // best-effort — on garde le tour d'origine
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
