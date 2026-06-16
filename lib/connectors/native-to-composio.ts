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

/** ID de feuille tolérant aux noms variés générés par le builder. */
function sheetId(p: Record<string, string>): string | undefined {
  return pick(p, "spreadsheetId", "spreadsheet_id", "fileId", "file_id", "sheetId", "sheet_id", "id");
}

export const NATIVE_TO_COMPOSIO: Record<string, ComposioActionMapping> = {
  "gmail.send": {
    toolSlug: "GMAIL_SEND_EMAIL",
    toolkitSlug: "gmail",
    mapParams: (p) =>
      clean({
        recipient_email: p.to,
        subject: p.subject,
        body: p.body,
      }),
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
        range: composeRange(p),
        values: pick(p, "values", "rows", "data") ?? "",
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
};

/** Verbe (forme variée) → verbe canonique du mapping. */
function canonicalVerb(verb: string): string {
  const v = verb.toLowerCase();
  if (/(read|get|fetch|list|values_get|load)/.test(v)) return "read";
  if (/(append|add|write|insert|values_append|create_row)/.test(v)) return "append";
  if (/(send|email|message|notify)/.test(v)) return "send";
  return v;
}

/**
 * Résout le mapping natif→Composio en tolérant les variantes d'id d'action
 * générées par le builder (ex. `google_sheets.read_sheet` → `sheets.read`).
 * Évite le faux « action pas disponible via Composio » sur des actions valides.
 */
export function composioMappingFor(actionId: string): ComposioActionMapping | undefined {
  const exact = NATIVE_TO_COMPOSIO[actionId];
  if (exact) return exact;

  const sep = actionId.includes(".") ? "." : "_";
  const [rawConn, ...rest] = actionId.split(sep);
  if (rest.length === 0) return undefined;
  const conn = CONNECTOR_ALIAS[rawConn.toLowerCase()];
  if (!conn) return undefined;
  const verb = canonicalVerb(rest.join("_"));
  return NATIVE_TO_COMPOSIO[`${conn}.${verb}`];
}
