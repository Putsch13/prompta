/**
 * Mapping centralisé des erreurs d'exécution agent → messages actionnables.
 *
 * Pilier C (Runtime) — REFONTE-prompta-runtime.md.
 *
 * Surcouche cohérente à `lib/connectors/format-action-error.ts` :
 *  - typée (`AgentRuntimeError` avec `code` + `hint`)
 *  - reconnaît les patterns récurrents (4xx connecteurs, placeholders non
 *    résolus, connexion manquante, plafonds)
 *  - réutilisable par `failExecution` (orchestrateur) ET l'UI (console run).
 */

import { formatActionError } from "@/lib/connectors/format-action-error";

export type AgentErrorCode =
  | "missing_connection"
  | "invalid_credentials"
  | "unresolved_placeholder"
  | "sheets_not_found"
  | "sheets_forbidden"
  | "gmail_invalid_header"
  | "gmail_forbidden"
  | "rate_limit"
  | "timeout"
  | "max_steps"
  | "max_tokens"
  | "max_output_bytes"
  | "max_tool_calls"
  | "approval_rejected"
  | "approval_expired"
  | "idempotency_conflict"
  | "missing_file_content"
  | "missing_required_params"
  | "retrieval_empty"
  | "code_runtime"
  | "unknown";

export interface AgentRuntimeError {
  code: AgentErrorCode;
  message: string;
  /** Action concrète à proposer à l'utilisateur (1 phrase). */
  hint?: string;
  /** Erreur d'origine (utile pour debug/logs). */
  raw?: string;
  connector?: string;
  action?: string;
}

/** Mappe une exception runtime en `AgentRuntimeError`. */
export function mapAgentError(
  err: unknown,
  ctx?: { connector?: string; action?: string },
): AgentRuntimeError {
  const raw = err instanceof Error ? err.message : String(err);
  const connector = ctx?.connector;
  const action = ctx?.action;

  // ─── Plafonds / limites ─────────────────────────────────────────────────
  if (/max_steps/.test(raw)) {
    return { code: "max_steps", message: "Limite d'étapes atteinte.", hint: "Réduisez le nombre d'étapes ou augmentez la limite.", raw };
  }
  if (/max_tokens/.test(raw)) {
    return { code: "max_tokens", message: "Limite de tokens atteinte.", hint: "Raccourcissez les prompts ou découpez en étapes plus petites.", raw };
  }
  if (/max_output_bytes/.test(raw)) {
    return { code: "max_output_bytes", message: "Sortie trop volumineuse.", hint: "Demandez à l'IA de produire un résumé plus court.", raw };
  }
  if (/max_tool_calls/.test(raw)) {
    return { code: "max_tool_calls", message: "Trop d'appels outils.", hint: "Limitez le recours aux outils dans le plan.", raw };
  }
  if (/timeout|timed out/i.test(raw)) {
    return { code: "timeout", message: "Délai dépassé.", hint: "Réessayez. Si ça persiste, simplifiez l'étape.", raw };
  }

  // ─── Approbations ───────────────────────────────────────────────────────
  // ⚠️ Regex volontairement étroites : « approbation/validation humaine » et non
  // un simple « rejet »/« expir » (sinon un token OAuth « expired » serait pris
  // pour une validation humaine et masquerait la vraie cause).
  if (/approval[\s_-]*rejected|validation humaine.*rejet|approbation.*rejet|action rejet/i.test(raw)) {
    return { code: "approval_rejected", message: "Action rejetée par l'humain.", raw };
  }
  if (/approval[\s_-]*expired|validation humaine.*expir|approbation.*expir/i.test(raw)) {
    return { code: "approval_expired", message: "Validation humaine expirée.", hint: "Relancez l'agent.", raw };
  }

  // ─── Recherche de données sans résultat ────────────────────────────────
  if (/retrieval_empty/i.test(raw)) {
    return {
      code: "retrieval_empty",
      message: raw.replace(/^.*retrieval_empty:\s*/, ""),
      hint: "Vérifiez le nom exact et le partage avec le compte connecté, puis relancez.",
      raw, connector, action,
    };
  }

  // ─── Champs requis manquants (garde Composio générique) ─────────────────
  if (/missing_required_params/i.test(raw)) {
    return {
      code: "missing_required_params",
      // Le message du garde liste déjà les champs et leurs libellés.
      message: raw.replace(/^.*missing_required_params:\s*/, ""),
      hint: "Ouvrez l'étape dans le builder et renseignez ces champs (valeur fixe, « Demander à l'abonné » ou « Générer par IA »).",
      raw, connector, action,
    };
  }

  // ─── Écriture de fichier sans contenu (P0-1) ────────────────────────────
  if (/missing_file_content/i.test(raw)) {
    return {
      code: "missing_file_content",
      message: "Impossible d'écrire le fichier : nom ou contenu manquant.",
      hint: "Le contenu ou le nom du fichier est vide — vérifiez le mapping de l'étape d'écriture Drive (file_name + contenu texte).",
      raw, connector, action,
    };
  }

  // ─── Placeholders / inputs non renseignés ───────────────────────────────
  if (/non renseigné|Paramètre «/i.test(raw) || /\{\{[^}]+\}\}/.test(raw)) {
    return {
      code: "unresolved_placeholder",
      message: raw,
      hint: "Renseignez la valeur ou choisissez la ressource dans le masque.",
      raw,
      connector,
      action,
    };
  }

  // ─── Connexion absente ──────────────────────────────────────────────────
  // ⚠️ Regex resserrée : on ne déclenche « Connectez X » que sur des signaux
  // EXPLICITES d'absence de connexion. Auparavant un simple « connecter » dans
  // un message d'erreur Composio (scope, compte multiple…) déclenchait à tort
  // « Connectez X » alors que l'utilisateur ÉTAIT connecté.
  if (
    /Connexion .* requise|connectez .* (avant d'ex|d'abord)/i.test(raw) ||
    /not connected|no connection|no connected account|connection not found/i.test(raw)
  ) {
    return {
      code: "missing_connection",
      message: connector ? `Connectez ${connector} pour utiliser cet agent.` : raw,
      hint: connector ? `Allez dans Connexions et reliez ${connector}.` : undefined,
      raw,
      connector,
      action,
    };
  }

  // ─── Credentials invalides (401) / token expiré ─────────────────────────
  if (
    /\b401\b|invalid authentication credentials|Expected OAuth 2 access token|Invalid Credentials|token has been expired|expired or revoked|token.*expired|unauthorized/i.test(
      raw,
    )
  ) {
    return {
      code: "invalid_credentials",
      message: connector
        ? `Authentification ${connector} invalide ou expirée.`
        : "Authentification invalide ou expirée.",
      hint: connector
        ? `Reconnectez ${connector} dans Connexions (le jeton d'accès n'est plus valide).`
        : "Reconnectez le service concerné — le jeton d'accès n'est plus valide.",
      raw, connector, action,
    };
  }

  // ─── Sheets ─────────────────────────────────────────────────────────────
  if (/Sheets.*404|spreadsheet.*404/i.test(raw)) {
    return {
      code: "sheets_not_found",
      message: "Feuille introuvable ou non partagée avec le compte connecté.",
      hint: "Vérifiez l'ID et partagez la feuille avec votre compte Google connecté.",
      raw, connector, action,
    };
  }
  if (/Sheets.*403|spreadsheet.*403/i.test(raw)) {
    return {
      code: "sheets_forbidden",
      message:
        "Le compte Google connecté n'a pas l'autorisation de lire cette feuille.",
      hint:
        "Deux causes possibles : (1) la feuille n'est pas partagée avec le compte connecté → partagez-la ; (2) la connexion a un scope limité (accès aux seuls fichiers créés par l'app) → reconnectez Google en autorisant l'accès complet à Sheets/Drive.",
      raw, connector, action,
    };
  }

  // ─── Gmail ──────────────────────────────────────────────────────────────
  if (/Gmail.*400/i.test(raw) && /from|to|subject/i.test(raw)) {
    return {
      code: "gmail_invalid_header",
      message: "En-tête email invalide.",
      hint: "Vérifiez l'adresse d'envoi (from) et le destinataire (to).",
      raw, connector, action,
    };
  }
  if (/Gmail.*403/i.test(raw)) {
    return {
      code: "gmail_forbidden",
      message: "Autorisation Gmail manquante.",
      hint: "Reconnectez Gmail avec le scope « envoyer un email ».",
      raw, connector, action,
    };
  }

  // ─── Rate limit / 429 ───────────────────────────────────────────────────
  if (/429|rate.?limit/i.test(raw)) {
    return {
      code: "rate_limit",
      message: "Limite d'API atteinte temporairement.",
      hint: "Réessayez dans quelques secondes.",
      raw, connector, action,
    };
  }

  // ─── Idempotence ────────────────────────────────────────────────────────
  if (/idempot|déjà en cours/i.test(raw)) {
    return {
      code: "idempotency_conflict",
      message: "Action externe déjà en cours pour cette étape.",
      hint: "Patientez ou relancez le run.",
      raw, connector, action,
    };
  }

  // ─── Code sandbox ───────────────────────────────────────────────────────
  if (/sandbox|python/i.test(raw)) {
    return { code: "code_runtime", message: raw, raw };
  }

  // ─── Fallback (utilise le formatteur connecteur si on en a le contexte) ─
  if (connector && action) {
    return {
      code: "unknown",
      message: formatActionError(connector, action, err),
      raw, connector, action,
    };
  }
  return { code: "unknown", message: raw, raw };
}

/** Affichage compact (libellé + tip) pour l'UI. */
export function formatRuntimeErrorForUi(err: AgentRuntimeError): string {
  return err.hint ? `${err.message} — ${err.hint}` : err.message;
}
