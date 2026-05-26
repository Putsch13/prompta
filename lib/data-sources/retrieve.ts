import { getUserConnection } from "@/lib/connections";
import { executeComposioTool } from "@/lib/composio/execute";
import { isComposioEnabled } from "@/lib/composio/client";
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

export async function retrieveFromSource(params: RetrieveParams): Promise<RetrieveResult> {
  const max = params.maxResults ?? 5;
  const sources: RetrieveResult["sources"] = [];

  switch (params.source) {
    case "file_upload": {
      const text = params.fileContent ?? "";
      sources.push({ type: "file_upload", label: "Fichier uploadé" });
      return { content: text.slice(0, 12000), sources };
    }

    case "url": {
      const content = await httpFetch(params.query);
      sources.push({ type: "url", label: params.query });
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

      sources.push({ type: params.source, label: params.query });
      return { content: result.output.slice(0, 12000), sources };
    }

    default:
      throw new Error(`Source non supportée : ${params.source}`);
  }
}
