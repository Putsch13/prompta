/**
 * Catalogue des ressources auto-créables par connecteur (modes assisted / managed).
 * Chaque entrée décrit ce que l'agent peut provisionner sans saisie manuelle.
 */

export type AutoResourceKind =
  | "google_spreadsheet"
  | "google_drive_folder"
  | "notion_database"
  | "notion_page"
  | "slack_channel"
  | "hubspot_list"
  | "linear_project"
  | "airtable_base"
  | "gmail_label";

export interface AutoResourceSpec {
  kind: AutoResourceKind;
  connector: string;
  inputKey: string;
  label: string;
  description: string;
}

/** Mapping action/connector → ressource auto-créable */
export const AUTO_PROVISION_CATALOG: AutoResourceSpec[] = [
  {
    kind: "google_spreadsheet",
    connector: "google_sheets",
    inputKey: "spreadsheet_id",
    label: "Feuille Google Sheets",
    description: "Crée une feuille avec en-têtes si aucun ID fourni",
  },
  {
    kind: "google_spreadsheet",
    connector: "googlesheets",
    inputKey: "spreadsheet_id",
    label: "Feuille Google Sheets",
    description: "Crée une feuille avec en-têtes si aucun ID fourni",
  },
  {
    kind: "google_drive_folder",
    connector: "google_drive",
    inputKey: "folder_id",
    label: "Dossier Google Drive",
    description: "Crée un dossier « Prompta » pour les livrables",
  },
  {
    kind: "notion_page",
    connector: "notion",
    inputKey: "page_id",
    label: "Page Notion",
    description: "Crée une page workspace pour les outputs",
  },
  {
    kind: "slack_channel",
    connector: "slack",
    inputKey: "channel",
    label: "Canal Slack",
    description: "Propose un canal #prompta-{agent} (dry-run si pas admin Slack)",
  },
  {
    kind: "hubspot_list",
    connector: "hubspot",
    inputKey: "list_id",
    label: "Liste HubSpot",
    description: "Crée une liste statique pour les prospects",
  },
  {
    kind: "gmail_label",
    connector: "gmail",
    inputKey: "label_id",
    label: "Libellé Gmail",
    description: "Crée le libellé Prompta pour tracer les envois",
  },
];

export function detectAutoResourcesFromManifest(manifest: {
  steps: { type: string; connector?: string; action?: string; params?: Record<string, string> }[];
  connectors?: string[];
}): AutoResourceSpec[] {
  const needed = new Set<string>();
  for (const step of manifest.steps) {
    if (step.type !== "action" || !step.connector) continue;
    needed.add(step.connector);
  }
  for (const c of manifest.connectors ?? []) needed.add(c);

  return AUTO_PROVISION_CATALOG.filter((spec) => needed.has(spec.connector));
}
