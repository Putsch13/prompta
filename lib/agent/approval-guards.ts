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

/**
 * Espaces personnels Google SANS envoi externe : écriture bénigne, pas
 * d'approval. Calendar en est EXCLU : un événement peut inviter des tiers
 * (envoi d'emails) → il doit passer par une validation humaine.
 */
const SAFE_WRITE_CONNECTORS = new Set([
  "google_sheets", "googlesheets", "google_docs", "googledocs",
  "google_drive", "googledrive",
]);

/**
 * Verbes de LECTURE (deny-by-default : tout ce qui n'est pas clairement une
 * lecture est traité comme une écriture sensible). Plus sûr qu'une liste de
 * verbes d'écriture forcément incomplète (stripe.charge, x.mutation…).
 */
const READ_VERB_RE = /^(get|list|read|search|find|fetch|lire|lis|rechercher|chercher|find|show|view|count|describe|export)/i;

type Step = AgentManifest["steps"][number];

/**
 * Une action est « sensible » (⇒ validation humaine) si elle sort des espaces
 * Google perso ET n'est pas manifestement une lecture. Deny-by-default.
 */
export function isSensitiveWriteStep(step: Step): boolean {
  if (step.type !== "action") return false;
  if (SAFE_WRITE_CONNECTORS.has(step.connector)) return false;
  const verbPart = (step.action.split(".").pop() ?? step.action).trim();
  return !READ_VERB_RE.test(verbPart);
}

/** Vrai si une étape — ou une sous-étape à N'IMPORTE quelle profondeur — est sensible. */
function stepTreeHasSensitiveWrite(step: Step): boolean {
  if (isSensitiveWriteStep(step)) return true;
  if (step.type === "parallel") {
    return step.branches.some((b) => b.steps.some((s) => stepTreeHasSensitiveWrite(s as Step)));
  }
  return false;
}

/**
 * Insère une validation humaine avant CHAQUE écriture sensible (y compris
 * imbriquée dans une branche parallèle) non déjà couverte par une validation en
 * amont. Une validation « couvre » une seule écriture sensible : deux envois
 * distincts exigent deux validations. Déterministe, ne fait confiance ni au LLM
 * ni au contenu de page.
 */
export function ensureApprovalGuards(manifest: AgentManifest): AgentManifest {
  const steps = [...manifest.steps];
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
