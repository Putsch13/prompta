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

/** Id canonique Composio (googlesheets, gmail…). */
export function normalizeConnectorId(id: string): string {
  return toComposioToolkitSlug(id);
}

/** Tous les ids équivalents à tester en base (legacy + Composio). */
export function connectorLookupIds(id: string): string[] {
  const canonical = normalizeConnectorId(id);
  const legacy = REVERSE_LEGACY[canonical];
  return Array.from(new Set([id, canonical, legacy].filter(Boolean)));
}

export function isSameConnector(a: string, b: string): boolean {
  return normalizeConnectorId(a) === normalizeConnectorId(b);
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
  return connectorLookupIds(requiredId).includes(storedConnectorId);
}
