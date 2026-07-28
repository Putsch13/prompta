/**
 * Garde-fous d'approbation — insertion d'une validation humaine avant chaque
 * écriture sensible d'un manifeste. Logique PURE et DÉTERMINISTE, partagée par
 * TOUS les chemins d'exécution : extension (planificateur/replan), API
 * /api/run/agent (agents publiés) et worker (runs asynchrones, planifiés,
 * webhooks, tests builder).
 *
 * Invariants sur lesquels s'appuient les reprises de run :
 *  - idempotence : ensureApprovalGuards(ensureApprovalGuards(m)) ≡ ensureApprovalGuards(m)
 *    (un manifeste déjà gardé — extension — ne reçoit JAMAIS de double approbation) ;
 *  - un PRÉFIXE d'un manifeste gardé est lui-même un point fixe de la garde
 *    (chaque approbation insérée précède immédiatement son écriture : trancher
 *    ne peut pas isoler une écriture de sa validation) — le replan peut donc
 *    recoller « préfixe exécuté + queue re-gardée » sans décalage d'index.
 */

import type { AgentManifest } from "@/lib/agent/schema";
import { canonicalConnectorKey } from "@/lib/connectors/resolve-id";

/**
 * Espaces personnels Google SANS envoi externe : écriture bénigne, pas
 * d'approval. Calendar en est EXCLU : un événement peut inviter des tiers
 * (envoi d'emails) → il doit passer par une validation humaine.
 */
// Formes CANONIQUES (canonicalConnectorKey : minuscules, alphanumérique).
const SAFE_WRITE_CONNECTORS = new Set(["googlesheets", "googledocs", "googledrive"]);

/**
 * Verbes de LECTURE (deny-by-default : tout ce qui n'est pas clairement une
 * lecture est traité comme une écriture sensible). Plus sûr qu'une liste de
 * verbes d'écriture forcément incomplète (stripe.charge, x.mutation…).
 */
const READ_VERB_RE = /^(get|list|read|search|find|fetch|lire|lis|rechercher|chercher|find|show|view|count|describe|export|query|retrieve|lookup)$/i;

type Step = AgentManifest["steps"][number];

/**
 * L'action est-elle manifestement une LECTURE ?
 *
 * Deux formats d'action coexistent dans les plans : natif « notion.search »
 * et slug Composio brut « NOTION_QUERY_DATABASE ». L'ancienne détection
 * testait un préfixe sur le segment après le dernier point : sur un slug
 * UPPER_SNAKE sans point, le « verbe » était le slug entier
 * (« NOTION_FETCH_DATA » ne commence pas par fetch) → l'utilisateur validait
 * des LECTURES. On tokenise donc et on teste chaque token — le préfixe
 * toolkit (« NOTION ») n'est jamais un verbe de lecture, il ne gêne pas.
 *
 * Garde-fou conservé : un token d'ÉCRITURE explicite prime (deny-by-default —
 * « search_and_replace », « find_and_delete » restent des écritures).
 */
const WRITE_VERB_RE =
  /^(send|create|add|insert|update|delete|remove|post|publish|write|append|move|archive|upload|import|set|replace|cancel|invite|assign|merge|charge|pay|refund|submit|execute|trigger)$/i;

function isReadOnlyAction(action: string): boolean {
  const tail = (action.split(".").pop() ?? action).trim();
  const tokens = tail.split(/[^a-zA-Z]+/).filter(Boolean);
  if (tokens.some((t) => WRITE_VERB_RE.test(t))) return false;
  return tokens.some((t) => READ_VERB_RE.test(t));
}

/**
 * Une action est « sensible » (⇒ validation humaine) si elle sort des espaces
 * Google perso ET n'est pas manifestement une lecture. Deny-by-default.
 */
export function isSensitiveWriteStep(step: Step): boolean {
  if (step.type !== "action") return false;
  // Canonisation : le LLM écrit « google_sheets », « Google Sheets » ou
  // « gsheets » — sans elle, une variante d'alias déclenchait une validation
  // par ligne écrite dans un tableur perso.
  if (SAFE_WRITE_CONNECTORS.has(canonicalConnectorKey(step.connector))) return false;
  return !isReadOnlyAction(step.action);
}

/**
 * Vrai si l'étape écrit quelque part — donc NON IDEMPOTENTE, donc jamais
 * rejouable à l'aveugle. Distinct de `isSensitiveWriteStep` : les espaces
 * Google perso n'exigent pas de validation humaine, mais un `append_row`
 * rejoué duplique quand même la ligne. Deny-by-default, comme au-dessus :
 * seule une action manifestement de lecture est considérée rejouable.
 */
export function isWriteActionStep(step: Step): boolean {
  if (step.type !== "action") return false;
  return !isReadOnlyAction(step.action);
}

/** Vrai si une étape — ou une sous-étape à N'IMPORTE quelle profondeur — est sensible. */
function stepTreeHasSensitiveWrite(step: Step): boolean {
  if (isSensitiveWriteStep(step)) return true;
  if (step.type === "parallel") {
    return step.branches.some((b) => b.steps.some((s) => stepTreeHasSensitiveWrite(s as Step)));
  }
  return false;
}

/** Types d'étapes qui METTENT LE RUN EN PAUSE (état persisté + reprise). */
const PAUSING_STEP_TYPES = new Set(["ask", "approval", "browser"]);

/**
 * Aplatit tout `parallel` contenant une étape de PAUSE : ses branches
 * deviennent des étapes séquentielles au même niveau, dans l'ordre.
 *
 * Pourquoi c'est une question de correction, pas de style : dans une branche,
 * l'orchestrateur indexe l'étape par un composite `i*100 + branche*10 + s`, et
 * c'est CE nombre qui part en base comme `agent_approvals.step_index`. À la
 * décision, `resume_from_step = stepIndex + 1` vaut alors ~202 sur un manifeste
 * de 6 étapes : la boucle de reprise ne s'exécute pas, le run est marqué
 * `completed` avec une sortie vide, et les écritures des branches sœurs sont
 * perdues. Le planificateur aplatissait déjà avant parsing, mais ni le replan,
 * ni l'auto-fix, ni les manifestes du builder ne le faisaient — d'où ce filet
 * au point de passage commun.
 *
 * Idempotent : après un passage, plus aucun parallel ne contient de pause.
 */
export function flattenPausingParallels(manifest: AgentManifest): AgentManifest {
  let changed = false;
  const steps: Step[] = [];
  for (const step of manifest.steps) {
    if (
      step.type === "parallel" &&
      step.branches.some((b) => b.steps.some((s) => PAUSING_STEP_TYPES.has(s.type)))
    ) {
      for (const b of step.branches) steps.push(...(b.steps as Step[]));
      changed = true;
      continue;
    }
    steps.push(step);
  }
  return changed ? { ...manifest, steps } : manifest;
}

/**
 * Insère une validation humaine avant CHAQUE écriture sensible (y compris
 * imbriquée dans une branche parallèle) non déjà couverte par une validation en
 * amont. Une validation « couvre » une seule écriture sensible : deux envois
 * distincts exigent deux validations. Déterministe, ne fait confiance ni au LLM
 * ni au contenu de page.
 *
 * Aplatit d'abord les parallels porteurs d'une pause (voir ci-dessus) : l'ordre
 * importe, les approbations doivent être posées sur les index définitifs.
 */
export function ensureApprovalGuards(manifest: AgentManifest): AgentManifest {
  const steps = [...flattenPausingParallels(manifest).steps];
  let pendingApproval = false; // une validation en amont, pas encore consommée
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === "approval") {
      pendingApproval = true;
      continue;
    }
    if (stepTreeHasSensitiveWrite(step)) {
      if (pendingApproval) {
        pendingApproval = false; // cette écriture consomme la validation existante
        continue;
      }
      const prevKey = [...steps.slice(0, i)].reverse().find((s) => "outputKey" in s && s.outputKey)?.outputKey;
      const label =
        step.type === "action"
          ? `${step.connector} → ${step.action}`
          : "action externe (branche parallèle)";
      steps.splice(i, 0, {
        type: "approval",
        label: `Valider avant : ${label}`,
        payloadTemplate: prevKey ? `{{${prevKey}}}` : `L'agent s'apprête à exécuter « ${label} ». Confirmez.`,
        outputKey: `validation_externe_${i}`,
      } as Step);
      i++; // sauter la validation insérée ; elle est consommée par cette écriture
    }
  }
  return { ...manifest, steps };
}

/**
 * Tampon posé dans `inputs` du run quand son exécution utilise le manifeste
 * GARDÉ : tous les index d'étapes persistés (paused_at_step, resume_from_step,
 * steps_completed) sont alors exprimés dans les coordonnées du manifeste gardé,
 * et toute relecture du manifeste pour ce run (reprise worker, résolution
 * d'outputKey d'approbation, étapes prévues de la console) doit re-garder
 * avant d'indexer. Un run repris SANS tampon (créé avant ce mécanisme) reste
 * sur le manifeste brut : le garder maintenant décalerait ses index.
 */
export const APPROVAL_GUARD_STAMP_KEY = "__guarded";
export const APPROVAL_GUARD_STAMP_VALUE = "1";

/** Vrai si les inputs du run portent le tampon « exécuté sur manifeste gardé ». */
export function hasApprovalGuardStamp(inputs: unknown): boolean {
  return (
    !!inputs &&
    typeof inputs === "object" &&
    (inputs as Record<string, unknown>)[APPROVAL_GUARD_STAMP_KEY] === APPROVAL_GUARD_STAMP_VALUE
  );
}

/**
 * Faut-il exécuter ce claim sur le manifeste gardé ?
 *  - run frais (resumeFromStep 0) : oui — aucune coordonnée persistée à préserver ;
 *  - reprise d'un run tamponné : oui — ses index sont déjà en coordonnées gardées ;
 *  - reprise d'un run NON tamponné (legacy, en vol au déploiement de la garde) :
 *    non — insérer des approbations décalerait resume_from_step/paused_at_step
 *    et ferait rejouer des actions déjà exécutées.
 */
export function shouldApplyApprovalGuards(resumeFromStep: number, alreadyStamped: boolean): boolean {
  return resumeFromStep === 0 || alreadyStamped;
}
