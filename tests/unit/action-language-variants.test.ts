/**
 * « Tics de langage » — le builder/copilote génère des ids d'action très
 * variés (FR/EN, accents, synonymes). La résolution d'outil doit :
 *  1. choisir un outil de la BONNE FAMILLE (lecture vs écriture vs envoi) ;
 *  2. ne JAMAIS élire un outil destructif pour un verbe de lecture ;
 *  3. ne JAMAIS élire un outil de lecture pour un verbe d'écriture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { pickToolSlug } from "../../lib/composio/resolve-native-action";
import { composioMappingFor } from "../../lib/connectors/native-to-composio";
import type { ComposioToolEntry } from "../../lib/composio/catalog";

function tool(slug: string, name: string, toolkit: string): ComposioToolEntry {
  return { slug, name, toolkit, inputs: [] };
}

// Catalogues réalistes (extraits des vrais toolkits Composio).
const CATALOGS: Record<string, ComposioToolEntry[]> = {
  googlesheets: [
    tool("GOOGLESHEETS_VALUES_GET", "Get values from Spreadsheet", "googlesheets"),
    tool("GOOGLESHEETS_VALUES_APPEND", "Append values to Spreadsheet", "googlesheets"),
    tool("GOOGLESHEETS_CREATE_GOOGLE_SHEET1", "Create Google Sheet", "googlesheets"),
    tool("GOOGLESHEETS_ADD_SHEET", "Add Sheet", "googlesheets"),
    tool("GOOGLESHEETS_DELETE_SHEET", "Delete Sheet", "googlesheets"),
    tool("GOOGLESHEETS_SEARCH_SPREADSHEETS", "Search Spreadsheets", "googlesheets"),
  ],
  gmail: [
    tool("GMAIL_SEND_EMAIL", "Send Email", "gmail"),
    tool("GMAIL_FETCH_EMAILS", "Fetch Emails", "gmail"),
    tool("GMAIL_CREATE_EMAIL_DRAFT", "Create Email Draft", "gmail"),
    tool("GMAIL_DELETE_MESSAGE", "Delete Message", "gmail"),
    tool("GMAIL_GET_PROFILE", "Get Profile", "gmail"),
  ],
  googledrive: [
    tool("GOOGLEDRIVE_LIST_FILES", "List Files", "googledrive"),
    tool("GOOGLEDRIVE_DOWNLOAD_FILE", "Download File", "googledrive"),
    tool("GOOGLEDRIVE_UPLOAD_FILE", "Upload File", "googledrive"),
    tool("GOOGLEDRIVE_CREATE_FOLDER", "Create Folder", "googledrive"),
    tool("GOOGLEDRIVE_DELETE_FILE", "Delete File", "googledrive"),
    tool("GOOGLEDRIVE_CREATE_FILE_FROM_TEXT", "Create File from Text", "googledrive"),
  ],
  googlecalendar: [
    tool("GOOGLECALENDAR_CREATE_EVENT", "Create Event", "googlecalendar"),
    tool("GOOGLECALENDAR_EVENTS_LIST", "Events List", "googlecalendar"),
    tool("GOOGLECALENDAR_DELETE_EVENT", "Delete Event", "googlecalendar"),
    tool("GOOGLECALENDAR_UPDATE_EVENT", "Update Event", "googlecalendar"),
  ],
  canva: [
    tool("CANVA_POST_DESIGNS", "Create Design", "canva"),
    tool("CANVA_LIST_DESIGNS", "List Designs", "canva"),
    tool("CANVA_GET_DESIGN", "Get Design", "canva"),
    tool("CANVA_CREATE_DESIGN_EXPORT_JOB", "Create Design Export Job", "canva"),
  ],
  slack: [
    tool("SLACK_SEND_MESSAGE", "Send Message to Channel", "slack"),
    tool("SLACK_LIST_CHANNELS", "List Channels", "slack"),
    tool("SLACK_DELETE_MESSAGE", "Delete Message", "slack"),
    tool("SLACK_SEARCH_MESSAGES", "Search Messages", "slack"),
  ],
  notion: [
    tool("NOTION_CREATE_PAGE", "Create Page", "notion"),
    tool("NOTION_SEARCH_NOTION_PAGE", "Search Notion Page", "notion"),
    tool("NOTION_UPDATE_PAGE", "Update Page", "notion"),
    tool("NOTION_DELETE_BLOCK", "Delete Block", "notion"),
  ],
};

const READ_TOOLS = new Set([
  "GOOGLESHEETS_VALUES_GET", "GOOGLESHEETS_SEARCH_SPREADSHEETS",
  "GMAIL_FETCH_EMAILS", "GMAIL_GET_PROFILE",
  "GOOGLEDRIVE_LIST_FILES", "GOOGLEDRIVE_DOWNLOAD_FILE",
  "GOOGLECALENDAR_EVENTS_LIST",
  "CANVA_LIST_DESIGNS", "CANVA_GET_DESIGN",
  "SLACK_LIST_CHANNELS", "SLACK_SEARCH_MESSAGES",
  "NOTION_SEARCH_NOTION_PAGE",
]);
const DESTRUCTIVE_TOOLS = new Set([
  "GOOGLESHEETS_DELETE_SHEET", "GMAIL_DELETE_MESSAGE", "GOOGLEDRIVE_DELETE_FILE",
  "GOOGLECALENDAR_DELETE_EVENT", "SLACK_DELETE_MESSAGE", "NOTION_DELETE_BLOCK",
]);

interface Variant {
  toolkit: string;
  action: string;
  /** famille attendue : "read" | "write" (création/envoi/modif) */
  family: "read" | "write";
  /** si précisé : le slug exact attendu */
  expectSlug?: string;
}

const VARIANTS: Variant[] = [
  // ── Sheets — écriture/création ──
  { toolkit: "googlesheets", action: "google_sheets.create_spreadsheet", family: "write", expectSlug: "GOOGLESHEETS_CREATE_GOOGLE_SHEET1" },
  { toolkit: "googlesheets", action: "google_sheets.creer_tableau", family: "write" },
  { toolkit: "googlesheets", action: "google_sheets.nouvelle_feuille", family: "write" },
  { toolkit: "googlesheets", action: "google_sheets.ecrire_valeurs", family: "write" },
  { toolkit: "googlesheets", action: "google_sheets.ajouter_ligne", family: "write" },
  // ── Sheets — lecture ──
  { toolkit: "googlesheets", action: "google_sheets.lire_feuille", family: "read" },
  { toolkit: "googlesheets", action: "google_sheets.recuperer_donnees", family: "read" },
  { toolkit: "googlesheets", action: "google_sheets.get_values", family: "read" },
  // ── Gmail ──
  { toolkit: "gmail", action: "gmail.envoyer_email", family: "write", expectSlug: "GMAIL_SEND_EMAIL" },
  { toolkit: "gmail", action: "gmail.send_mail", family: "write", expectSlug: "GMAIL_SEND_EMAIL" },
  { toolkit: "gmail", action: "gmail.lire_emails", family: "read" },
  { toolkit: "gmail", action: "gmail.fetch_inbox", family: "read" },
  { toolkit: "gmail", action: "gmail.rediger_brouillon", family: "write" },
  // ── Drive ──
  { toolkit: "googledrive", action: "google_drive.lister_fichiers", family: "read" },
  { toolkit: "googledrive", action: "google_drive.telecharger_fichier", family: "read" },
  { toolkit: "googledrive", action: "google_drive.creer_dossier", family: "write", expectSlug: "GOOGLEDRIVE_CREATE_FOLDER" },
  { toolkit: "googledrive", action: "google_drive.ecrire_fichier", family: "write" },
  { toolkit: "googledrive", action: "google_drive.upload_document", family: "write" },
  // ── Calendar ──
  { toolkit: "googlecalendar", action: "google_calendar.creer_evenement", family: "write", expectSlug: "GOOGLECALENDAR_CREATE_EVENT" },
  { toolkit: "googlecalendar", action: "google_calendar.planifier_rdv", family: "write" },
  { toolkit: "googlecalendar", action: "google_calendar.lister_evenements", family: "read" },
  { toolkit: "googlecalendar", action: "google_calendar.modifier_evenement", family: "write" },
  // ── Canva ──
  { toolkit: "canva", action: "canva.create_design", family: "write", expectSlug: "CANVA_POST_DESIGNS" },
  { toolkit: "canva", action: "canva.creer_presentation", family: "write" },
  { toolkit: "canva", action: "canva.generer_visuel", family: "write" },
  { toolkit: "canva", action: "canva.lister_designs", family: "read" },
  // ── Slack ──
  { toolkit: "slack", action: "slack.envoyer_message", family: "write", expectSlug: "SLACK_SEND_MESSAGE" },
  { toolkit: "slack", action: "slack.publier_message", family: "write", expectSlug: "SLACK_SEND_MESSAGE" },
  { toolkit: "slack", action: "slack.chercher_messages", family: "read" },
  // ── Notion ──
  { toolkit: "notion", action: "notion.creer_page", family: "write", expectSlug: "NOTION_CREATE_PAGE" },
  { toolkit: "notion", action: "notion.rechercher_page", family: "read" },
];

for (const v of VARIANTS) {
  test(`variantes — ${v.action} → famille ${v.family}`, () => {
    // Le mapping statique (registry natif) peut court-circuiter : on vérifie
    // qu'il respecte la famille lui aussi.
    const mapped = composioMappingFor(v.action);
    const slug = mapped?.toolSlug ?? pickToolSlug(CATALOGS[v.toolkit], v.toolkit, v.action);

    assert.ok(slug, `aucun outil résolu pour ${v.action}`);
    // Invariant 1 : jamais destructif sans verbe destructif.
    assert.ok(!DESTRUCTIVE_TOOLS.has(slug!), `${v.action} → outil destructif ${slug}`);
    if (v.family === "read") {
      // Invariant 2 : une lecture n'écrit jamais.
      assert.ok(READ_TOOLS.has(slug!), `${v.action} → ${slug} n'est pas un outil de lecture`);
    } else {
      // Invariant 3 : une écriture ne se résout jamais en lecture.
      assert.ok(!READ_TOOLS.has(slug!), `${v.action} → ${slug} est un outil de LECTURE`);
    }
    if (v.expectSlug) {
      assert.equal(slug, v.expectSlug);
    }
  });
}

test("variantes — un verbe destructif reste possible quand demandé explicitement", () => {
  const slug = pickToolSlug(CATALOGS.googledrive, "googledrive", "google_drive.supprimer_fichier");
  assert.equal(slug, "GOOGLEDRIVE_DELETE_FILE");
});

test("mapping curaté — create_spreadsheet → CREATE_GOOGLE_SHEET1 (pas ROW, pas ADD_SHEET)", () => {
  const m = composioMappingFor("google_sheets.create_spreadsheet");
  assert.equal(m?.toolSlug, "GOOGLESHEETS_CREATE_GOOGLE_SHEET1");
});

test("mapping curaté — creer_tableau / nouvelle_feuille → création de feuille", () => {
  assert.equal(composioMappingFor("google_sheets.creer_tableau")?.toolSlug, "GOOGLESHEETS_CREATE_GOOGLE_SHEET1");
  assert.equal(composioMappingFor("google_sheets.nouvelle_feuille")?.toolSlug, "GOOGLESHEETS_CREATE_GOOGLE_SHEET1");
});

test("mapping curaté — create_row reste un APPEND (pas une création de feuille)", () => {
  assert.equal(composioMappingFor("google_sheets.create_row")?.toolSlug, "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND");
});

import { toSheetValues } from "../../lib/connectors/native-to-composio";

test("sheets.append — valeurs libres converties en tableau 2D JSON", () => {
  assert.equal(toSheetValues("QA;Prompta;ok"), '[["QA","Prompta","ok"]]');
  assert.equal(toSheetValues("a,b\nc,d"), '[["a","b"],["c","d"]]');
  assert.equal(toSheetValues('[["x"]]'), '[["x"]]');
  const m = composioMappingFor("google_sheets.append_row");
  const mapped = m!.mapParams({ spreadsheet_id: "abc", values: "1;2" });
  assert.equal(mapped.values, '[["1","2"]]');
});

test("mapping — verbe créateur + objet inconnu ne crée PAS de feuille (faire_le_cafe)", () => {
  assert.equal(composioMappingFor("google_sheets.faire_le_cafe"), undefined);
});
