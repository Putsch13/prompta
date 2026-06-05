/** Aide à la saisie manuelle des ressources (sans picker API). */
export function resourceInputHint(resourceType: string): string {
  switch (resourceType) {
    case "google_sheets.spreadsheet":
      return "ID du fichier Google Sheets — dans l'URL : docs.google.com/spreadsheets/d/【CET_ID】/edit";
    case "google_sheets.tab":
      return "Nom exact de l'onglet (ex. Feuil1, Données, Export)";
    case "gmail.send_as":
      return "Adresse d'envoi (ex. vous@domaine.com)";
    case "slack.channel":
      return "ID du canal Slack (ex. C0123456789) ou #nom-du-canal";
    default:
      return "Identifiant de la ressource dans votre compte connecté";
  }
}

export function resourceInputPlaceholder(resourceType: string): string {
  switch (resourceType) {
    case "google_sheets.spreadsheet":
      return "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
    case "google_sheets.tab":
      return "Feuil1";
    case "gmail.send_as":
      return "mon@email.com";
    case "slack.channel":
      return "C0123456789";
    default:
      return "ID ou identifiant";
  }
}
