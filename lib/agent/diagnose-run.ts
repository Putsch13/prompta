/**
 * Diagnostic d'un run échoué → liste de correctifs actionnables.
 *
 * Déterministe (pas de LLM) : on s'appuie sur les `errorCode` produits par
 * `lib/agent/error-map.ts` pour proposer, par étape en échec, une action
 * concrète (reconnecter un service, fournir un ID/une valeur, relancer…).
 * Une couche LLM peut ensuite reformuler le `summary` de façon chaleureuse,
 * mais les actions restent ancrées sur ce calcul (jamais d'auth inventée).
 */

export interface FailedStepInfo {
  stepIndex: number;
  label?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  actionSlug?: string | null;
  toolSlug?: string | null;
  connector?: string | null;
}

export type RunFixKind =
  | "connect"
  | "reconnect"
  | "resource"
  | "input"
  | "write_content"
  | "retry"
  | "limit"
  | "approval"
  | "unknown";

export interface RunFix {
  id: string;
  kind: RunFixKind;
  title: string;
  detail: string;
  /** Connecteur concerné (connect/reconnect), pour générer le lien d'auth. */
  connector?: string;
  stepIndex: number;
  severity: "blocker" | "warning";
  /** Relancer suffit-il (sans action préalable) ? */
  retryable: boolean;
}

/** Déduit le slug du connecteur depuis un slug d'action/outil (GOOGLEDRIVE_… → googledrive). */
export function connectorFromStep(s: FailedStepInfo): string | undefined {
  if (s.connector?.trim()) return s.connector.trim();
  const slug = s.actionSlug ?? s.toolSlug ?? "";
  if (!slug) return undefined;
  if (slug.includes(".")) return slug.split(".")[0]; // google_drive.read_file
  if (slug.includes("_")) return slug.split("_")[0].toLowerCase(); // GOOGLEDRIVE_…
  return undefined;
}

function fixForStep(s: FailedStepInfo): RunFix {
  const stepIndex = s.stepIndex;
  const connector = connectorFromStep(s);
  const base = { stepIndex, connector };
  const code = s.errorCode ?? "unknown";

  switch (code) {
    case "missing_connection":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "connect",
        severity: "blocker",
        retryable: false,
        title: connector ? `Connecter ${connector}` : "Connecter le service requis",
        detail:
          "Ce service n'est pas relié à votre compte. Connectez-le, puis relancez.",
      };
    case "invalid_credentials":
    case "gmail_forbidden":
    case "sheets_forbidden":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "reconnect",
        severity: "blocker",
        retryable: false,
        title: connector ? `Reconnecter ${connector}` : "Reconnecter le service",
        detail:
          "L'accès est insuffisant ou expiré (token/permissions). Reconnectez le service en autorisant les accès demandés, puis testez l'accès.",
      };
    case "sheets_not_found":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "resource",
        severity: "blocker",
        retryable: false,
        title: "Vérifier la ressource ciblée",
        detail:
          "La feuille/le fichier est introuvable ou non partagé avec le compte connecté. Fournissez le bon ID (ou collez l'URL) et partagez la ressource.",
      };
    case "unresolved_placeholder":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "input",
        severity: "blocker",
        retryable: false,
        title: "Renseigner une valeur manquante",
        detail:
          s.errorMessage?.trim() ||
          "Un paramètre requis n'est pas renseigné. Fournissez la valeur ou choisissez la ressource.",
      };
    case "missing_file_content":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "write_content",
        severity: "blocker",
        retryable: false,
        title: "Nom ou contenu de fichier manquant",
        detail:
          "L'étape d'écriture n'a ni nom ni contenu. Vérifiez le mapping (file_name + contenu texte produit par une étape amont).",
      };
    case "gmail_invalid_header":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "input",
        severity: "blocker",
        retryable: false,
        title: "En-tête email invalide",
        detail: "Vérifiez l'adresse d'envoi (from) et le destinataire (to).",
      };
    case "rate_limit":
    case "timeout":
    case "idempotency_conflict":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "retry",
        severity: "warning",
        retryable: true,
        title: "Réessayer",
        detail:
          "Erreur temporaire (limite d'API, délai ou action déjà en cours). Relancez dans quelques secondes.",
      };
    case "max_steps":
    case "max_tokens":
    case "max_output_bytes":
    case "max_tool_calls":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "limit",
        severity: "warning",
        retryable: false,
        title: "Limite atteinte",
        detail:
          s.errorMessage?.trim() ||
          "Une limite d'exécution a été atteinte. Simplifiez le plan ou augmentez la limite.",
      };
    case "approval_rejected":
    case "approval_expired":
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "approval",
        severity: "warning",
        retryable: true,
        title: "Validation humaine",
        detail:
          "Une validation humaine a été refusée ou a expiré. Relancez puis validez l'étape concernée.",
      };
    default:
      return {
        ...base,
        id: `fix-${stepIndex}`,
        kind: "unknown",
        severity: "warning",
        retryable: true,
        title: "Erreur à examiner",
        detail:
          s.errorMessage?.trim() ||
          "Cause non catégorisée. Consultez les détails techniques de l'étape.",
      };
  }
}

export function diagnoseFailedSteps(steps: FailedStepInfo[]): {
  fixes: RunFix[];
  summary: string;
} {
  const failed = steps.filter((s) => (s.errorCode ?? s.errorMessage) != null);
  const fixes = failed.map(fixForStep);

  // Déduplique les correctifs identiques (même kind + connecteur) — ex. plusieurs
  // étapes Drive qui demandent la même reconnexion.
  const seen = new Set<string>();
  const deduped: RunFix[] = [];
  for (const f of fixes) {
    const key = `${f.kind}:${f.connector ?? ""}:${f.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
  }

  const blockers = deduped.filter((f) => f.severity === "blocker");
  const summary =
    deduped.length === 0
      ? "Aucune erreur exploitable détectée."
      : blockers.length > 0
        ? `${blockers.length} point(s) bloquant(s) à corriger avant de relancer.`
        : "Erreurs temporaires : un relancement devrait suffire.";

  return { fixes: deduped, summary };
}
