/**
 * Infère placeholders, exemples et aide contextuelle pour les variables d'entrée.
 * Priorité : registre connecteur > clé param explicite > heuristiques ciblées.
 */

export interface EnvFieldBase {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "file" | "list";
  required?: boolean;
  help?: string;
  connectorId?: string;
  paramKey?: string;
  resourceType?: string;
}

export interface EnrichedEnvField extends EnvFieldBase {
  placeholder: string;
  help: string;
  example?: string;
  hintTitle?: string;
  hintDetail?: string;
  inputMode?: "text" | "numeric" | "email" | "url";
}

function isSpreadsheetIdField(field: EnvFieldBase): boolean {
  const key = field.paramKey ?? field.key;
  if (/^(spreadsheetId|sheet_id|google_sheets_id)$/i.test(key)) return true;
  if (/_spreadsheetId$/i.test(field.key)) return true;
  if (field.resourceType === "google_sheets.spreadsheet") return true;
  return false;
}

function isRangeField(field: EnvFieldBase): boolean {
  const key = field.paramKey ?? field.key;
  return key === "range" || /_range$/i.test(field.key);
}

export function enrichEnvField(field: EnvFieldBase): EnrichedEnvField {
  const base: EnrichedEnvField = {
    ...field,
    type: field.type ?? "text",
    required: field.required ?? false,
    placeholder: "",
    help: field.help?.trim() ?? "",
  };

  if (isRangeField(field)) {
    return {
      ...base,
      type: "text",
      placeholder: "Sheet1!A1:D10",
      example: "Sheet1!A1:D10",
      help: base.help || "Par défaut : tout le classeur. Ex. Sheet1!A1:D10 pour une zone précise.",
    };
  }

  if (isSpreadsheetIdField(field)) {
    return {
      ...base,
      type: "text",
      placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      help:
        base.help ||
        "ID de la feuille Google Sheets — pas votre email Gmail.",
      hintTitle: "Où trouver l'ID Google Sheets ?",
      hintDetail:
        "1. Ouvrez votre feuille dans le navigateur\n" +
        "2. Copiez l'ID dans l'URL : docs.google.com/spreadsheets/d/【CET_ID】/edit\n" +
        "3. Exemple : …/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit\n\n" +
        "La connexion Google Sheets (OAuth) se fait dans Connexions.",
    };
  }

  const labelKey = `${field.key} ${field.label}`.toLowerCase();

  if (
    /gmail|expéditeur|expediteur|sender|from_name|nom.*mail|nom.*expéd/.test(labelKey) &&
    !isRangeField(field)
  ) {
    return {
      ...base,
      type: "text",
      placeholder: "Marie — MonAgence",
      example: "Florent — Prompta",
      help:
        base.help ||
        "Nom affiché comme expéditeur (ex. « Prénom — Société »). Ce n'est pas votre mot de passe ni l'adresse Gmail.",
      hintTitle: "Ce champ ≠ connexion Gmail",
      hintDetail:
        "Connectez d'abord Gmail dans Dashboard → Connexions (OAuth).\n" +
        "Ici, indiquez seulement le nom visible dans l'email envoyé.",
    };
  }

  if (/région|region|zone|secteur.*geo|ville/.test(labelKey)) {
    return {
      ...base,
      placeholder: "Occitanie, Toulouse et environs",
      example: "Bretagne, Rennes + 30 km",
      help: base.help || "Zone géographique ciblée pour la prospection ou la recherche.",
    };
  }

  if (/mot.?clé|keyword|métier|artisan|secteur|niche/.test(labelKey)) {
    return {
      ...base,
      type: base.type === "number" ? "text" : base.type,
      placeholder: "plombier, électricien, couvreur",
      example: "menuisier, peintre, maçon",
      help:
        base.help ||
        "Mots-clés métiers séparés par des virgules — utilisés pour la recherche web.",
    };
  }

  if (/max|nombre|limit|contact|prospect|quota/.test(labelKey)) {
    return {
      ...base,
      type: "number",
      placeholder: "5",
      example: "5",
      inputMode: "numeric",
      help:
        base.help ||
        "Nombre max de contacts/lignes à traiter. Commencez petit en test (3–5).",
    };
  }

  if (/offre|proposition|pitch|message.*commercial|accroche/.test(labelKey)) {
    return {
      ...base,
      type: "textarea",
      placeholder:
        "Audit gratuit de 30 min pour améliorer votre visibilité en ligne…",
      help:
        base.help ||
        "Proposition commerciale ou accroche incluse dans les emails générés.",
    };
  }

  if (/email.*dest|destinataire|recipient/.test(labelKey)) {
    return {
      ...base,
      type: "text",
      placeholder: "client@exemple.fr",
      inputMode: "email",
      help: base.help || "Adresse email du destinataire (pour les tests).",
    };
  }

  if (/url|lien|site/.test(labelKey) && field.paramKey !== "range") {
    return {
      ...base,
      type: "text",
      placeholder: "https://exemple.fr",
      inputMode: "url",
      help: base.help || "URL complète avec https://",
    };
  }

  if (!base.help) {
    base.help = `Valeur pour « ${field.label || field.key} » — utilisée dans les étapes de l'agent.`;
  }

  base.placeholder = field.label ? `Ex. ${field.label.toLowerCase()}` : "";
  return base;
}

export const CONNECTOR_PLAYGROUND_HINTS: Record<
  string,
  { label: string; hint: string }
> = {
  gmail: {
    label: "Gmail",
    hint: "Connectez Gmail (OAuth) dans Connexions — aucun mot de passe à saisir ici.",
  },
  google_sheets: {
    label: "Google Sheets",
    hint: "Connectez Google Sheets dans Connexions, puis renseignez l'ID de la feuille ci-dessous.",
  },
  googlesheets: {
    label: "Google Sheets",
    hint: "Connectez Google Sheets dans Connexions, puis renseignez l'ID de la feuille ci-dessous.",
  },
  slack: {
    label: "Slack",
    hint: "Connectez Slack dans Connexions avant de lancer le test.",
  },
  hubspot: {
    label: "HubSpot",
    hint: "Connectez HubSpot dans Connexions avant de lancer le test.",
  },
};
