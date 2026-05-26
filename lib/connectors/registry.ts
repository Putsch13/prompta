import type { Connector } from "./types";

export type { ConnectorAction } from "./types";

export const CONNECTORS: Connector[] = [
  {
    id: "gmail",
    label: "Gmail",
    authType: "oauth",
    category: "Email",
    helpUrl: "https://myaccount.google.com/",
    why: "L'agent lit et envoie des emails depuis votre compte Gmail.",
    actions: [
      {
        id: "gmail.send",
        label: "Envoyer un email",
        inputs: [
          { key: "to", label: "Destinataire", required: true },
          { key: "subject", label: "Objet", required: true },
          { key: "body", label: "Corps", type: "textarea", required: true },
        ],
      },
      {
        id: "gmail.read",
        label: "Lire les emails récents",
        inputs: [{ key: "query", label: "Filtre (ex: is:unread)", required: false }],
      },
    ],
  },
  {
    id: "google_sheets",
    label: "Google Sheets",
    authType: "oauth",
    category: "Productivité",
    why: "L'agent lit ou écrit des lignes dans vos feuilles de calcul.",
    actions: [
      {
        id: "sheets.read",
        label: "Lire des lignes",
        inputs: [
          { key: "spreadsheetId", label: "ID du spreadsheet", required: true },
          { key: "range", label: "Plage (ex: Sheet1!A1:D10)", required: true },
        ],
      },
      {
        id: "sheets.append",
        label: "Ajouter une ligne",
        inputs: [
          { key: "spreadsheetId", label: "ID du spreadsheet", required: true },
          { key: "range", label: "Plage", required: true },
          { key: "values", label: "Valeurs (JSON array)", required: true },
        ],
      },
    ],
  },
  {
    id: "slack",
    label: "Slack",
    authType: "oauth",
    category: "Messagerie",
    why: "L'agent envoie des messages dans vos canaux Slack.",
    actions: [
      {
        id: "slack.send",
        label: "Envoyer un message",
        inputs: [
          { key: "channel", label: "Canal (#general ou ID)", required: true },
          { key: "text", label: "Message", type: "textarea", required: true },
        ],
      },
    ],
  },
  {
    id: "telegram",
    label: "Telegram",
    authType: "api_key",
    category: "Messagerie",
    why: "L'agent envoie des messages via votre bot Telegram.",
    actions: [
      {
        id: "telegram.send",
        label: "Envoyer un message",
        inputs: [
          { key: "chat_id", label: "Chat ID", required: true },
          { key: "text", label: "Message", type: "textarea", required: true },
        ],
      },
    ],
  },
  {
    id: "canva",
    label: "Canva",
    authType: "oauth",
    category: "Design",
    why: "L'agent crée un design Canva depuis un template.",
    actions: [
      {
        id: "canva.create",
        label: "Créer un design",
        inputs: [
          { key: "template_id", label: "ID template Canva", required: true },
          { key: "title", label: "Titre", required: true },
        ],
      },
    ],
  },
];

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export function getConnectorAction(connectorId: string, actionId: string) {
  const c = getConnector(connectorId);
  return c?.actions.find((a) => a.id === actionId);
}

export function connectorsForSteps(steps: { type: string; connector?: string }[]): string[] {
  const ids = new Set<string>();
  for (const s of steps) {
    if (s.type === "action" && s.connector) ids.add(s.connector);
  }
  return Array.from(ids);
}
