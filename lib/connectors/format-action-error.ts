import { isResourcePlaceholder } from "./param-bindings";

/** Messages actionnables pour les erreurs d'exécution connecteur. */
export function formatActionError(
  connector: string,
  action: string,
  err: unknown,
): string {
  const raw = err instanceof Error ? err.message : String(err);
  const label = `${connector} → ${action}`;

  if (isResourcePlaceholder(raw) || raw.includes("{{resource:")) {
    return `${label} : ressource non choisie — renseignez l'identifiant dans le masque de run.`;
  }
  if (/non renseigné|Paramètre «/i.test(raw)) {
    return raw;
  }
  if (/Google Sheets.*404|Sheets.*404|spreadsheet.*404/i.test(raw)) {
    return `${label} : feuille introuvable ou non partagée avec le compte connecté. Vérifiez l'ID et les droits Drive.`;
  }
  if (/Gmail.*400/i.test(raw) && raw.includes("From")) {
    return `${label} : adresse d'envoi invalide — reconnectez Gmail ou laissez le compte choisir l'adresse principale.`;
  }
  if (/403/.test(raw)) {
    return `${label} : autorisation manquante (403) — reconnectez ${connector} avec les permissions requises.`;
  }
  if (/404/.test(raw)) {
    return `${label} : ressource introuvable (404).`;
  }
  return `${label} : ${raw}`;
}

export function isUnresolvedParamValue(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  if (isResourcePlaceholder(value)) return true;
  return /^\{\{[\w.:]+\}\}$/.test(value.trim());
}
