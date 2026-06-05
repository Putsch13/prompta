export type ResourceListVia = "native" | "composio";

export interface ResourceTypeDef {
  id: string;
  connectorId: string;
  label: string;
  listVia: ResourceListVia;
  /** Action Composio ou clé handler native dans list-resources */
  listAction?: string;
  parentType?: string;
}

export const RESOURCE_TYPES: Record<string, ResourceTypeDef> = {
  "google_sheets.spreadsheet": {
    id: "google_sheets.spreadsheet",
    connectorId: "google_sheets",
    label: "Feuille de calcul",
    listVia: "native",
    listAction: "native:google_sheets.spreadsheet",
  },
  "google_sheets.tab": {
    id: "google_sheets.tab",
    connectorId: "google_sheets",
    label: "Onglet",
    listVia: "native",
    listAction: "native:google_sheets.tab",
    parentType: "google_sheets.spreadsheet",
  },
  "google_drive.folder": {
    id: "google_drive.folder",
    connectorId: "google_drive",
    label: "Dossier Drive",
    listVia: "native",
    listAction: "native:google_drive.folder",
  },
  "google_drive.file": {
    id: "google_drive.file",
    connectorId: "google_drive",
    label: "Fichier Drive",
    listVia: "native",
    listAction: "native:google_drive.file",
    parentType: "google_drive.folder",
  },
  "gmail.send_as": {
    id: "gmail.send_as",
    connectorId: "gmail",
    label: "Adresse d'envoi",
    listVia: "native",
    listAction: "native:gmail.send_as",
  },
  "slack.channel": {
    id: "slack.channel",
    connectorId: "slack",
    label: "Salon Slack",
    listVia: "native",
    listAction: "native:slack.channel",
  },
  "notion.database": {
    id: "notion.database",
    connectorId: "notion",
    label: "Base Notion",
    listVia: "composio",
    listAction: "NOTION_SEARCH_NOTION_PAGE",
  },
  "notion.page": {
    id: "notion.page",
    connectorId: "notion",
    label: "Page Notion",
    listVia: "composio",
    listAction: "NOTION_SEARCH_NOTION_PAGE",
  },
  "airtable.base": {
    id: "airtable.base",
    connectorId: "airtable",
    label: "Base Airtable",
    listVia: "composio",
    listAction: "AIRTABLE_LIST_BASES",
  },
  "airtable.table": {
    id: "airtable.table",
    connectorId: "airtable",
    label: "Table Airtable",
    listVia: "composio",
    listAction: "AIRTABLE_LIST_TABLES",
    parentType: "airtable.base",
  },
  "calendar.calendar": {
    id: "calendar.calendar",
    connectorId: "google_calendar",
    label: "Calendrier",
    listVia: "native",
    listAction: "native:calendar.calendar",
  },
};

export function getResourceType(id: string): ResourceTypeDef | undefined {
  return RESOURCE_TYPES[id];
}

/** Mapping heuristique Composio input key → resourceType */
const COMPOSIO_INPUT_RESOURCE_HINTS: Record<string, string> = {
  spreadsheet_id: "google_sheets.spreadsheet",
  spreadsheetid: "google_sheets.spreadsheet",
  sheet_id: "google_sheets.tab",
  channel_id: "slack.channel",
  channel: "slack.channel",
  database_id: "notion.database",
  page_id: "notion.page",
  base_id: "airtable.base",
  table_id: "airtable.table",
  folder_id: "google_drive.folder",
  file_id: "google_drive.file",
  calendar_id: "calendar.calendar",
  from: "gmail.send_as",
  send_as: "gmail.send_as",
};

export function inferComposioResourceType(inputKey: string): string | undefined {
  const k = inputKey.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  return COMPOSIO_INPUT_RESOURCE_HINTS[k];
}
