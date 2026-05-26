/**
 * Infère placeholders, exemples et aide contextuelle pour les variables d'entrée.
 * Complète les champs générés par IA quand l'aide est absente ou vague.
 */

export interface EnvFieldBase {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "file" | "list";
  required?: boolean;
  help?: string;
}

export interface EnrichedEnvField extends EnvFieldBase {
  placeholder: string;
  help: string;
  example?: string;
  hintTitle?: string;
  hintDetail?: string;
  inputMode?: "text" | "numeric" | "email" | "url";
}

function haystack(field: EnvFieldBase): string {
  return `${field.key} ${field.label} ${field.help ?? ""}`.toLowerCase();
}

function matches(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

export function enrichEnvField(field: EnvFieldBase): EnrichedEnvField {
  const text = haystack(field);
  const base: EnrichedEnvField = {
    ...field,
    type: field.type ?? "text",
    required: field.required ?? false,
    placeholder: "",
    help: field.help?.trim() ?? "",
  };

  if (
    matches(text, [
      /sheet/,
      /spreadsheet/,
      /google.?sheet/,
      /feuille/,
      /identifiant.*base/,
    ])
  ) {
    return {
      ...base,
      type: "text",
      placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      example: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      help:
        base.help ||
        "ID de la feuille Google Sheets à lire/écrire — pas votre email Gmail.",
      hintTitle: "Où trouver l'ID Google Sheets ?",
      hintDetail:
        "1. Ouvrez votre feuille dans le navigateur\n" +
        "2. Copiez l'ID dans l'URL : docs.google.com/spreadsheets/d/【CET_ID】/edit\n" +
        "3. Exemple : …/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit\n\n" +
        "La connexion Google Sheets (OAuth) se fait dans Connexions — ici vous indiquez uniquement quelle feuille utiliser.",
    };
  }

  if (
    matches(text, [
      /gmail/,
      /expéditeur/,
      /expediteur/,
      /sender/,
      /from_name/,
      /nom.*mail/,
      /nom.*expéd/,
    ])
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
        "Ici, indiquez seulement le nom visible dans l'email envoyé, par ex. « Sophie — Artisan Pro ».",
    };
  }

  if (matches(text, [/région/, /region/, /zone/, /secteur.*geo/, /ville/])) {
    return {
      ...base,
      placeholder: "Occitanie, Toulouse et environs",
      example: "Bretagne, Rennes + 30 km",
      help: base.help || "Zone géographique ciblée pour la prospection ou la recherche.",
    };
  }

  if (
    matches(text, [
      /mot.?clé/,
      /keyword/,
      /métier/,
      /artisan/,
      /secteur/,
      /niche/,
    ])
  ) {
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

  if (
    matches(text, [
      /max/,
      /nombre/,
      /limit/,
      /contact/,
      /prospect/,
      /quota/,
    ])
  ) {
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

  if (
    matches(text, [
      /offre/,
      /proposition/,
      /pitch/,
      /message.*commercial/,
      /accroche/,
    ])
  ) {
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

  if (matches(text, [/email.*dest/, /destinataire/, /recipient/])) {
    return {
      ...base,
      type: "text",
      placeholder: "client@exemple.fr",
      inputMode: "email",
      help: base.help || "Adresse email du destinataire (pour les tests).",
    };
  }

  if (matches(text, [/url/, /lien/, /site/])) {
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
