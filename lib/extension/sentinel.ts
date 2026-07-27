/**
 * Détection de la sentinelle « MISSION » du tac au tac (/api/extension/instant).
 *
 * Le modèle répond soit directement (régime 1), soit par la sentinelle seule
 * (régime 2) — c'est le seul aiguillage entre « réponse streamée » et « on
 * bascule en agent complet ». Un faux négatif ici perd purement la demande de
 * l'utilisateur : le mot s'affiche en clair et aucun run n'est créé.
 *
 * Deux détections complémentaires :
 *  - en TÊTE de flux (tampon tant que la tête peut encore être un préfixe) ;
 *  - en FIN de flux, quand la sentinelle suit un préambule.
 */

export const SENTINEL = "MISSION";

/**
 * Détection tolérante : ignore espaces/markdown/guillemets de tête et la casse
 * (« **Mission** », « MISSION : je vais… » → mission).
 */
export function stripLead(s: string): string {
  return s.replace(/^[\s*_#>`"'«\-–—]+/, "");
}

export function isSentinelLead(s: string): boolean {
  const lead = stripLead(s);
  if (lead.slice(0, SENTINEL.length).toUpperCase() !== SENTINEL) return false;
  const next = lead[SENTINEL.length];
  // Frontière de mot : « MISSION », « Mission : … » oui ; « Missionnaire » non.
  return next === undefined || !/[a-zA-ZÀ-ÿ]/.test(next);
}

/** Encore ambigu ? (préfixe de la sentinelle, frontière de mot pas encore vue) */
export function couldBecomeSentinel(s: string): boolean {
  const lead = stripLead(s).toUpperCase();
  return lead.length <= SENTINEL.length && SENTINEL.startsWith(lead);
}

/**
 * Rattrapage : sentinelle émise APRÈS un préambule (« D'accord, je m'en
 * occupe.\nMISSION ») — comportement courant des modèles de raisonnement.
 *
 * La détection en tête de flux ne cherche plus rien dès qu'un caractère non
 * conforme est sorti : la mission n'était alors JAMAIS déclenchée, le mot
 * « MISSION » s'affichait tel quel et la demande se perdait en silence.
 *
 * Volontairement étroit pour ne pas confondre avec une vraie réponse qui
 * parlerait de missions : réponse courte, plusieurs lignes, et la DERNIÈRE
 * ligne réduite à la sentinelle seule.
 */
export const TRAILING_SENTINEL_MAX_CHARS = 240;

export function isTrailingSentinel(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed || trimmed.length > TRAILING_SENTINEL_MAX_CHARS) return false;
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return false; // le cas mono-ligne est déjà traité en tête
  const last = lines[lines.length - 1];
  // Ligne réduite à la sentinelle (tolère « **MISSION** », « MISSION. »).
  return isSentinelLead(last) && stripLead(last).length <= SENTINEL.length + 2;
}
