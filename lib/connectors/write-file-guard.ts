/**
 * Garde-fou « écriture de fichier » (P0-1).
 *
 * Empêche la classe de bug où un agent crée un fichier Drive vide nommé
 * « Untitled » (`application/octet-stream`) parce que l'action choisie ne
 * transporte ni nom ni contenu (ex. `GOOGLEDRIVE_CREATE_FILE` qui ne crée
 * qu'une métadonnée). On vérifie AVANT exécution qu'un nom ET un contenu
 * texte sont présents pour les actions d'écriture de document.
 */

const NAME_KEYS = ["file_name", "filename", "name", "title", "document_title", "doc_name"];

const CONTENT_KEYS = [
  "text_content",
  "content",
  "body",
  "text",
  "file_content",
  "data",
  "markdown_text",
  "html_content",
];

/** Le slug/action désigne-t-il une écriture de document texte ? */
export function isTextDocumentWrite(actionId: string): boolean {
  const a = actionId.toLowerCase();
  // Patterns Composio / natifs qui produisent un document avec du contenu.
  if (/create_file_from_text|from_text|create_document|append_text|create_doc\b|write_file|upsert_document/.test(a)) {
    return true;
  }
  // Création de fichier « générique » Drive : on exige aussi nom + contenu,
  // car sans contenu elle produit un fichier vide.
  if (/create_file\b|upload_file|files_create|drive.*create/.test(a)) return true;
  return false;
}

function firstNonEmpty(params: Record<string, string>, keys: string[]): string | undefined {
  for (const k of Object.keys(params)) {
    const lower = k.toLowerCase();
    if (keys.includes(lower) || keys.some((wanted) => lower.includes(wanted))) {
      const v = params[k];
      if (v != null && String(v).trim() !== "") return String(v);
    }
  }
  return undefined;
}

export interface WriteFileCheck {
  ok: boolean;
  /** Raison lisible si invalide. */
  reason?: string;
}

/**
 * Valide qu'une action d'écriture de fichier a un nom ET un contenu non vides.
 * Retourne `{ ok: true }` pour toute action qui n'est pas une écriture de doc.
 */
export function checkWriteFileParams(
  actionId: string,
  params: Record<string, string>,
): WriteFileCheck {
  if (!isTextDocumentWrite(actionId)) return { ok: true };

  const name = firstNonEmpty(params, NAME_KEYS);
  const content = firstNonEmpty(params, CONTENT_KEYS);

  if (!name && !content) {
    return {
      ok: false,
      reason: "Le nom et le contenu du fichier sont vides.",
    };
  }
  if (!name) {
    return { ok: false, reason: "Le nom du fichier est vide." };
  }
  if (!content) {
    return { ok: false, reason: "Le contenu du fichier est vide." };
  }
  return { ok: true };
}
