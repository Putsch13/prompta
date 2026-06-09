/**
 * Extraction d'ID de ressource depuis une URL collée.
 *
 * Problème résolu : l'utilisateur colle l'URL d'un Doc/Sheet/dossier Drive
 * (« l'URL ne donne aucun id »), or les API (Composio/Google) attendent l'ID
 * brut. On extrait l'ID de façon déterministe ; si la valeur n'est pas une URL
 * reconnue, on la renvoie telle quelle (donc sûr à appliquer largement).
 */

const GOOGLE_PATTERNS: RegExp[] = [
  // docs.google.com/{document|spreadsheets|presentation}/d/<ID>
  /https?:\/\/docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/,
  // drive.google.com/file/d/<ID>
  /https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
  // drive.google.com/drive/(u/N/)?folders/<ID>
  /https?:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/,
];

/** Notion : 32 caractères hex à la fin de l'URL (avec ou sans tirets). */
const NOTION_PATTERN =
  /https?:\/\/(?:www\.)?notion\.so\/[^?#]*?([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Récupère un paramètre `id=` ou `key=` dans une query string générique. */
function fromQueryParam(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.searchParams.get("id") ?? url.searchParams.get("key") ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Si `value` est une URL connue (Google/Notion) ou contient `?id=`, renvoie
 * l'ID extrait. Sinon renvoie `value` inchangé.
 */
export function extractResourceId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return value;

  for (const re of GOOGLE_PATTERNS) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1];
  }

  const notion = trimmed.match(NOTION_PATTERN);
  if (notion?.[1]) return notion[1].replace(/-/g, "");

  const q = fromQueryParam(trimmed);
  if (q) return q;

  return value;
}

/** Indique si la valeur ressemble à une URL dont on sait extraire un ID. */
export function looksLikeResourceUrl(value: string): boolean {
  return extractResourceId(value) !== value;
}
