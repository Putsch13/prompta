/**
 * Mapping actions « natives » (registry) → outils Composio.
 *
 * Pourquoi : le registry déclare des actions au format natif (`sheets.read`,
 * `gmail.send`…) qui appellent l'API du service directement. Mais si la
 * connexion de l'utilisateur passe par **Composio**, on ne dispose pas d'un
 * token OAuth du service (on a un `composio_account_id`). Appeler l'API native
 * avec cet identifiant donne un **401**. On route donc l'exécution vers l'outil
 * Composio équivalent, avec les bons arguments.
 *
 * Les slugs et noms d'arguments ci-dessous sont vérifiés sur la doc Composio
 * (docs.composio.dev, mai 2026) :
 *  - GMAIL_SEND_EMAIL : recipient_email, subject, body
 *  - GMAIL_FETCH_EMAILS : query, max_results
 *  - GOOGLESHEETS_VALUES_GET : spreadsheet_id, range
 *  - GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND : spreadsheet_id, range, values
 *  - SLACK_SEND_MESSAGE : channel, text
 */

export interface ComposioActionMapping {
  toolSlug: string;
  toolkitSlug: string;
  /** Convertit les params natifs en arguments Composio (valeurs en string). */
  mapParams: (params: Record<string, string>) => Record<string, string>;
}

function isPlaceholder(v?: string): boolean {
  if (!v?.trim()) return true;
  return v.trim().startsWith("{{");
}

/** Reproduit la logique native : combine onglet + plage, défaut "A:Z". */
function composeRange(params: Record<string, string>): string {
  const tab = params.tab?.trim();
  const rawRange = params.range?.trim() ?? "";
  const range = rawRange && !isPlaceholder(rawRange) ? rawRange : "A:Z";
  return tab && !range.includes("!") ? `${tab}!${range}` : range;
}

/** Retire les clés vides / placeholders non résolus. */
function clean(obj: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const t = v.trim();
    if (!t || isPlaceholder(t)) continue;
    out[k] = t;
  }
  return out;
}

/** Première valeur non vide / non placeholder parmi plusieurs clés possibles. */
function pick(p: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = p[k];
    if (v != null && !isPlaceholder(v)) return v;
  }
  return undefined;
}

import { markdownToEmailHtml, looksLikeHtml } from "@/lib/email/markdown-to-html";

/** ID de feuille tolérant aux noms variés générés par le builder. */
function sheetId(p: Record<string, string>): string | undefined {
  return pick(p, "spreadsheetId", "spreadsheet_id", "fileId", "file_id", "sheetId", "sheet_id", "id");
}

export const NATIVE_TO_COMPOSIO: Record<string, ComposioActionMapping> = {
  "gmail.send": {
    toolSlug: "GMAIL_SEND_EMAIL",
    toolkitSlug: "gmail",
    // Les agents rédigent en markdown : converti en HTML propre (is_html),
    // sinon l'email arrivait brut (« **titre** », listes plates).
    mapParams: (p) => {
      const body = p.body ?? "";
      const html = looksLikeHtml(body) ? body : markdownToEmailHtml(body);
      return clean({
        recipient_email: p.to,
        subject: p.subject,
        body: html,
        is_html: "true",
      });
    },
  },
  "gmail.read": {
    toolSlug: "GMAIL_FETCH_EMAILS",
    toolkitSlug: "gmail",
    mapParams: (p) =>
      clean({
        query: p.query,
        max_results: "5",
      }),
  },
  "sheets.read": {
    toolSlug: "GOOGLESHEETS_VALUES_GET",
    toolkitSlug: "googlesheets",
    mapParams: (p) =>
      clean({
        spreadsheet_id: sheetId(p),
        range: composeRange(p),
      }),
  },
  "sheets.append": {
    toolSlug: "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
    toolkitSlug: "googlesheets",
    mapParams: (p) =>
      clean({
        spreadsheet_id: sheetId(p),
        // range requis par le schéma. « A:Z » nu est rejeté par le parseur
        // Composio ; « A1 » est l'ancre d'append standard, valide sans nom
        // d'onglet (qui varie selon la langue : Sheet1 / Feuille 1). Le défaut
        // registre (defaultValue "A:Z") arrive ici via applyActionParamDefaults :
        // on le neutralise aussi, sinon tout append sans plage explicite échoue.
        range: (() => {
          const r = pick(p, "range", "tab") ? composeRange(p) : "A1";
          return r === "A:Z" ? "A1" : r;
        })(),
        values: toSheetValues(pick(p, "values", "rows", "data") ?? ""),
        // Requis par l'outil : interprète les valeurs comme une saisie
        // utilisateur (formules/formats), le choix sûr par défaut.
        value_input_option: "USER_ENTERED",
      }),
  },
  // Ajout d'un ONGLET — curaté : « add_sheet / add_worksheet / create_tab »
  // matchait la famille « append » (token « add ») et partait ajouter une
  // LIGNE (VALUES_APPEND) au lieu de créer l'onglet.
  "sheets.add_tab": {
    toolSlug: "GOOGLESHEETS_ADD_SHEET",
    toolkitSlug: "googlesheets",
    mapParams: (p) =>
      clean({
        spreadsheet_id: sheetId(p),
        title: pick(p, "title", "name", "tab", "onglet", "titre", "nom") ?? "Nouvel onglet",
      }),
  },
  // Recherche YouTube — curaté : la résolution dynamique préférait
  // YOUTUBE_LIST_CHANNEL_VIDEOS (exige channelId/mine) dès que l'id contenait
  // « videos » ; la recherche par mots-clés est YOUTUBE_SEARCH_YOU_TUBE.
  "youtube.search": {
    toolSlug: "YOUTUBE_SEARCH_YOU_TUBE",
    toolkitSlug: "youtube",
    mapParams: (p) =>
      clean({
        q: pick(p, "q", "query", "search", "recherche", "sujet", "keywords"),
      }),
  },
  // Création d'une FEUILLE (le document) — curaté : la résolution dynamique
  // hésitait entre CREATE_SPREADSHEET_ROW (une ligne) et ADD_SHEET (un onglet).
  "sheets.create": {
    toolSlug: "GOOGLESHEETS_CREATE_GOOGLE_SHEET1",
    toolkitSlug: "googlesheets",
    mapParams: (p) =>
      clean({
        title: pick(p, "title", "name", "titre", "nom") ?? "Nouvelle feuille",
      }),
  },
  "slack.send": {
    toolSlug: "SLACK_SEND_MESSAGE",
    toolkitSlug: "slack",
    mapParams: (p) =>
      clean({
        channel: p.channel,
        text: p.text,
      }),
  },
};

/** Connecteur (forme variée) → préfixe canonique des clés de mapping. */
const CONNECTOR_ALIAS: Record<string, string> = {
  google_sheets: "sheets",
  googlesheets: "sheets",
  sheets: "sheets",
  gmail: "gmail",
  google_mail: "gmail",
  slack: "slack",
  youtube: "youtube",
};

/**
 * Valeurs libres → tableau 2D JSON attendu par VALUES_APPEND.
 * « a;b;c » → [["a","b","c"]] ; multi-lignes → une ligne de feuille par ligne
 * de texte ; un JSON déjà formé passe tel quel.
 */
export function toSheetValues(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.startsWith("[")) return t;
  const rows = t
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/[;,\t]/).map((c) => c.trim()));
  return JSON.stringify(rows.length ? rows : [[t]]);
}

/** Verbe (forme variée) → verbe canonique du mapping. */
function canonicalVerb(verb: string): string {
  const v = verb.toLowerCase();
  // Matching par TOKENS entiers — la version sous-chaîne faisait matcher
  // « read » dans « spREADsheet » : create_spreadsheet était mappé sur
  // l'outil de LECTURE (VALUES_GET) au lieu de la résolution dynamique.
  const folded = v.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tokens = new Set(folded.split(/[^a-z0-9]+/));
  const has = (...ws: string[]) => ws.some((w) => tokens.has(w));
  if (has("read", "get", "fetch", "list", "load", "lire", "lis", "recuperer")) return "read";
  // « search » AVANT les familles d'écriture : search_videos / find_items sont
  // des recherches par mots-clés, pas des listages de ressources possédées.
  if (has("search", "find", "chercher", "rechercher", "recherche")) return "search";
  // « row »/« ligne » AVANT create : create_row = ajouter une ligne, pas créer la feuille.
  if (has("append", "add", "write", "insert", "ajouter", "ecrire", "ecris", "row", "ligne")) return "append";
  if (has("send", "email", "message", "notify", "envoyer", "envoie")) return "send";
  if (has("create", "creer", "new", "nouvelle", "nouveau", "make", "faire", "generer")) return "create";
  return folded;
}

/**
 * Résout le mapping natif→Composio en tolérant les variantes d'id d'action
 * générées par le builder (ex. `google_sheets.read_sheet` → `sheets.read`).
 * Évite le faux « action pas disponible via Composio » sur des actions valides.
 */
// Objets plausibles pour la famille « create » de Sheets : sans ce garde,
// « faire_le_cafe » créait une feuille (le verbe matchait, l'objet était
// ignoré). Une action au verbe créateur mais à l'objet inconnu retombe sur
// la résolution dynamique → « action introuvable » clair.
const SHEETS_CREATE_OBJECTS = new Set([
  "spreadsheet", "sheet", "sheets", "feuille", "tableau", "classeur",
  "fichier", "document", "doc", "nouvelle", "nouveau", "new",
]);

export function composioMappingFor(actionId: string): ComposioActionMapping | undefined {
  const exact = NATIVE_TO_COMPOSIO[actionId];
  if (exact) return exact;

  const sep = actionId.includes(".") ? "." : "_";
  const [rawConn, ...rest] = actionId.split(sep);
  if (rest.length === 0) return undefined;
  const conn = CONNECTOR_ALIAS[rawConn.toLowerCase()];
  if (!conn) return undefined;
  const verbPhrase = rest.join("_");
  const verb = canonicalVerb(verbPhrase);

  // Objet ONGLET + intention d'ajout → sheets.add_tab, AVANT la famille de
  // verbe : « add_worksheet » matcherait « append » (token add) et ajouterait
  // une ligne, « create_tab » raterait le garde-objet de sheets.create.
  if (conn === "sheets") {
    const toks = new Set(
      verbPhrase
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
    // « create_sheet / new_sheet » restent la création du DOCUMENT (historique) ;
    // « add_sheet / insert_sheet » suivent la sémantique API (AddSheet = onglet).
    const tabObject =
      ["tab", "onglet", "worksheet"].some((t) => toks.has(t)) ||
      (toks.has("sheet") && !toks.has("spreadsheet") && ["add", "insert", "ajouter"].some((t) => toks.has(t)));
    const addIntent = ["add", "create", "new", "insert", "ajouter", "creer", "nouvel", "nouvelle"].some((t) => toks.has(t));
    if (tabObject && addIntent) return NATIVE_TO_COMPOSIO["sheets.add_tab"];
  }

  if (conn === "sheets" && verb === "create") {
    const toks = verbPhrase
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const objectOk = toks.length <= 1 || toks.some((t) => SHEETS_CREATE_OBJECTS.has(t));
    if (!objectOk) return undefined;
  }

  return NATIVE_TO_COMPOSIO[`${conn}.${verb}`];
}
