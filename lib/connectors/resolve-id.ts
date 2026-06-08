/** Mapping ids Prompta ↔ slugs Composio (safe client + server). */
export const LEGACY_TOOLKIT_MAP: Record<string, string> = {
  google_sheets: "googlesheets",
  google_drive: "googledrive",
  google_docs: "googledocs",
  google_calendar: "googlecalendar",
  google_slides: "googleslides",
  gmail: "gmail",
  slack: "slack",
  telegram: "telegram",
  canva: "canva",
};

export function toComposioToolkitSlug(connectorId: string): string {
  return LEGACY_TOOLKIT_MAP[connectorId] ?? connectorId;
}

const REVERSE_LEGACY: Record<string, string> = {};
for (const [legacy, composio] of Object.entries(LEGACY_TOOLKIT_MAP)) {
  REVERSE_LEGACY[composio] = legacy;
}

/**
 * Clé de comparaison robuste, agnostique aux séparateurs et à la casse.
 * Évite la classe de bug « google_drive ≠ googledrive » pour TOUS les
 * connecteurs (300+ toolkits Composio), pas seulement ceux mappés à la main.
 */
export function canonicalConnectorKey(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Id canonique Composio (googlesheets, gmail…). */
export function normalizeConnectorId(id: string): string {
  return toComposioToolkitSlug(id);
}

/** Tous les ids équivalents à tester en base (legacy + Composio + forme sans séparateur). */
export function connectorLookupIds(id: string): string[] {
  const canonical = normalizeConnectorId(id);
  const legacy = REVERSE_LEGACY[canonical];
  const stripped = canonicalConnectorKey(id);
  return Array.from(new Set([id, canonical, legacy, stripped].filter(Boolean)));
}

export function isSameConnector(a: string, b: string): boolean {
  if (normalizeConnectorId(a) === normalizeConnectorId(b)) return true;
  return canonicalConnectorKey(a) === canonicalConnectorKey(b);
}

/** Déduplique une liste en gardant le slug canonique. */
export function dedupeConnectors(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const canonical = normalizeConnectorId(id);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(id);
  }
  return out;
}

export function connectionMatchesConnector(
  storedConnectorId: string,
  requiredId: string
): boolean {
  if (connectorLookupIds(requiredId).includes(storedConnectorId)) return true;
  // Filet de sécurité générique : comparaison sans séparateur ni casse
  // (couvre tout toolkit Composio, même non mappé explicitement).
  return canonicalConnectorKey(storedConnectorId) === canonicalConnectorKey(requiredId);
}
