/** Scopes OAuth minimum requis par connecteur natif. */
export const CONNECTOR_REQUIRED_SCOPES: Record<string, string[]> = {
  gmail: [
    "https://www.googleapis.com/auth/gmail.send",
    "gmail.send",
  ],
  google_sheets: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
    "spreadsheets",
    "drive.metadata.readonly",
  ],
  slack: ["chat:write"],
  canva: ["design:content:write"],
};

/** Scopes passés au paramètre OAuth `scope=` (URLs complètes uniquement). */
export function getOAuthScopeParam(connectorId: string): string {
  const urls = (CONNECTOR_REQUIRED_SCOPES[connectorId] ?? []).filter((s) =>
    s.startsWith("https://"),
  );
  return urls.join(" ");
}

/** Connecteurs où un email de compte doit être vérifiable avant run. */
export const CONNECTORS_REQUIRING_EMAIL = new Set(["gmail", "google_sheets"]);

export function getRequiredScopes(connectorId: string): string[] {
  return CONNECTOR_REQUIRED_SCOPES[connectorId] ?? [];
}

export function missingRequiredScopes(granted: string[], connectorId: string): string[] {
  const required = getRequiredScopes(connectorId);
  if (required.length === 0) return [];
  const normalizedGranted = granted.map((s) => s.toLowerCase());
  return required.filter(
    (req) =>
      !normalizedGranted.some(
        (g) => g === req.toLowerCase() || g.includes(req.toLowerCase()) || req.toLowerCase().includes(g),
      ),
  );
}
