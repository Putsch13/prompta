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
          {
            key: "from",
            label: "Adresse d'envoi",
            required: true,
            kind: "identity",
            resourceType: "gmail.send_as",
            defaultScope: "end_user",
          },
          {
            key: "to",
            label: "Destinataire",
            required: true,
            kind: "input",
            type: "email",
            defaultScope: "dynamic",
          },
          { key: "subject", label: "Objet", required: true, kind: "input", defaultScope: "dynamic" },
          { key: "body", label: "Corps", type: "textarea", required: true, kind: "step_ref", defaultScope: "dynamic" },
        ],
      },
      {
        id: "gmail.read",
        label: "Lire les emails récents",
        inputs: [{ key: "query", label: "Filtre Gmail (optionnel)", required: false, defaultValue: "", help: "Vide = emails récents. Ex. is:unread" }],
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
          {
            key: "spreadsheetId",
            label: "Feuille de calcul",
            required: true,
            kind: "resource",
            resourceType: "google_sheets.spreadsheet",
            defaultScope: "end_user",
          },
          {
            key: "tab",
            label: "Onglet",
            required: false,
            kind: "resource",
            resourceType: "google_sheets.tab",
            dependsOn: "spreadsheetId",
            defaultScope: "end_user",
          },
          {
            key: "range",
            label: "Plage (optionnel)",
            required: false,
            kind: "input",
            defaultScope: "dynamic",
            defaultValue: "*",
            help: "Par défaut : tout le classeur (tous les onglets). Ex. Sheet1!A1:D10 pour une zone précise.",
            placeholder: "Sheet1!A1:D10",
          },
        ],
      },
      {
        id: "sheets.append",
        label: "Ajouter une ligne",
        inputs: [
          {
            key: "spreadsheetId",
            label: "Feuille de calcul",
            required: true,
            kind: "resource",
            resourceType: "google_sheets.spreadsheet",
            defaultScope: "end_user",
          },
          {
            key: "range",
            label: "Plage (ex: Sheet1!A1:D10)",
            required: true,
            kind: "input",
            defaultScope: "dynamic",
            help: "Plage d'écriture (onglet + cellules).",
            placeholder: "Sheet1!A1:D10",
          },
          { key: "values", label: "Valeurs (JSON array)", required: true, kind: "input", defaultScope: "dynamic" },
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
          {
            key: "channel",
            label: "Salon",
            required: true,
            kind: "resource",
            resourceType: "slack.channel",
            defaultScope: "end_user",
          },
          { key: "text", label: "Message", type: "textarea", required: true, kind: "input", defaultScope: "dynamic", help: "Texte du message Slack.", placeholder: "Bonjour, voici le résumé…" },
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

export function connectorsForSteps(steps: { type: string; connector?: string; branches?: { steps: { type: string; connector?: string }[] }[] }[]): string[] {
  const ids = new Set<string>();
  function walk(list: typeof steps) {
    for (const s of list) {
      if (s.type === "parallel" && s.branches) {
        for (const branch of s.branches) walk(branch.steps as typeof steps);
      } else if (s.type === "action" && s.connector) {
        ids.add(s.connector);
      }
    }
  }
  walk(steps);
  return Array.from(ids);
}
