import { getUserConnection } from "@/lib/connections";
import { executeComposioTool } from "@/lib/composio/execute";
import { isComposioEnabled } from "@/lib/composio/client";
import { getDocumentText } from "@/lib/documents/user-documents";
import { httpFetch } from "@/lib/agent/tools";

export type DataSourceType =
  | "file_upload"
  | "google_drive"
  | "notion"
  | "google_sheets"
  | "url"
  | "gmail"
  | "hubspot"
  | "custom_api";

export interface RetrieveParams {
  source: DataSourceType;
  query: string;
  maxResults?: number;
  userId: string;
  fileContent?: string;
}

export interface RetrieveResult {
  content: string;
  sources: { type: string; label: string }[];
}

/** Extrait la 1re URL http(s) d'un texte (tolère une query en phrase). */
export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  // Déjà une URL nue ?
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed.replace(/[).,;]+$/, "");
  const match = trimmed.match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0].replace(/[).,;]+$/, "") : null;
}

/** Sortie d'une recherche « sans résultat » (fonction pure, testable). */
export function isEmptyRetrieval(output: string): boolean {
  const t = output.trim();
  if (!t) return true;
  // Structures vides fréquentes renvoyées par les outils Composio.
  if (/^(\[\]|\{\}|null|"")$/.test(t)) return true;
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed) && parsed.length === 0) return true;
    if (parsed && typeof parsed === "object") {
      const arr =
        (parsed as Record<string, unknown>).files ??
        (parsed as Record<string, unknown>).results ??
        (parsed as Record<string, unknown>).items ??
        (parsed as Record<string, unknown>).messages ??
        (parsed as Record<string, unknown>).data;
      if (Array.isArray(arr) && arr.length === 0) return true;
    }
  } catch {
    // pas du JSON — on se fie au texte
  }
  return /no files? found|aucun (r[eé]sultat|fichier)|not found|0 results?/i.test(t);
}

export async function retrieveFromSource(params: RetrieveParams): Promise<RetrieveResult> {
  const max = params.maxResults ?? 5;
  const sources: RetrieveResult["sources"] = [];

  switch (params.source) {
    case "file_upload": {
      const docId = params.query?.trim();
      if (docId && /^[0-9a-f-]{36}$/i.test(docId)) {
        const text = await getDocumentText(params.userId, docId);
        sources.push({ type: "file_upload", label: `Document ${docId.slice(0, 8)}…` });
        return { content: text.slice(0, 12000), sources };
      }
      const text = params.fileContent ?? "";
      sources.push({ type: "file_upload", label: "Fichier uploadé" });
      return { content: text.slice(0, 12000), sources };
    }

    case "url": {
      // La query peut être une phrase (« Extraire … depuis https://… pour … »).
      // On en extrait la 1re URL http(s) plutôt que de parser tout le texte.
      const url = extractFirstUrl(params.query);
      if (!url) {
        throw new Error(
          `unresolved_placeholder: Aucune URL valide trouvée dans la requête de l'étape « ${params.source} ». ` +
            `Fournissez une URL complète (https://…).`,
        );
      }
      const content = await httpFetch(url);
      sources.push({ type: "url", label: url });
      return { content: content.slice(0, 12000), sources };
    }

    case "google_sheets":
    case "notion":
    case "gmail":
    case "hubspot":
    case "google_drive": {
      if (!isComposioEnabled()) {
        throw new Error(`Composio requis pour ${params.source}`);
      }
      const conn = await getUserConnection(params.userId, params.source === "google_sheets" ? "googlesheets" : params.source);
      if (!conn) {
        throw new Error(`Connectez ${params.source} avant de récupérer des données`);
      }

      // Garde-fou : une requête vide ou un placeholder non résolu provoque un
      // 400 cryptique côté provider (ex. Google Drive « Bad Request »). On
      // remonte un message actionnable à la place.
      const q = params.query?.trim() ?? "";
      if (!q || q.includes("{{")) {
        throw new Error(
          `unresolved_placeholder: La requête de recherche ${params.source} est vide ou non renseignée. ` +
            `Renseignez la variable de recherche (mot-clé / nom de fichier) au lancement de l'agent.`,
        );
      }

      // Google Sheets : si la requête contient l'ID/URL d'une feuille précise,
      // on LIT directement ses valeurs (scope Sheets seul) au lieu de
      // SEARCH_SPREADSHEETS qui cherche dans Drive → exige le scope Drive et
      // provoque sinon un 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT.
      if (params.source === "google_sheets") {
        const { extractResourceId } = await import("@/lib/connectors/extract-resource-id");
        const fromUrl = extractFirstUrl(q);
        const candidate = (fromUrl ? extractResourceId(fromUrl) : extractResourceId(q)).trim();
        if (/^[a-zA-Z0-9_-]{20,}$/.test(candidate)) {
          const valuesResult = await executeComposioTool("GOOGLESHEETS_VALUES_GET", params.userId, {
            spreadsheet_id: candidate,
            range: "A:Z",
          });
          sources.push({ type: "google_sheets", label: candidate });
          return { content: valuesResult.output.slice(0, 12000), sources };
        }
      }

      const actionMap: Record<string, string> = {
        google_sheets: "GOOGLESHEETS_SEARCH_SPREADSHEETS",
        notion: "NOTION_SEARCH_NOTION_PAGE",
        gmail: "GMAIL_FETCH_EMAILS",
        hubspot: "HUBSPOT_SEARCH_CONTACTS",
        google_drive: "GOOGLEDRIVE_FIND_FILE",
      };

      const actionSlug = actionMap[params.source];
      const result = await executeComposioTool(actionSlug, params.userId, {
        query: params.query,
        max_results: String(max),
      });

      // Recherche SANS RÉSULTAT = échec explicite : sinon l'agent continue avec
      // un contenu vide (« pas de fichier trouvé ») et l'utilisateur ne
      // comprend l'échec qu'à l'étape de validation, trop tard. On coupe ici
      // avec un message actionnable.
      if (isEmptyRetrieval(result.output)) {
        throw new Error(
          `retrieval_empty: Aucun résultat pour « ${q} » dans ${params.source}. ` +
            `Vérifiez le nom/mot-clé et que l'élément est bien partagé avec le compte connecté.`,
        );
      }

      sources.push({ type: params.source, label: params.query });
      return { content: result.output.slice(0, 12000), sources };
    }

    default:
      throw new Error(`Source non supportée : ${params.source}`);
  }
}
