import { Composio } from "@composio/core";

let instance: Composio | null = null;

export function isComposioEnabled(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}

export function getComposioClient(): Composio {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY non configurée");
  }
  if (!instance) {
    instance = new Composio({ apiKey });
  }
  return instance;
}

/** Slugs natifs Prompta → slugs Composio */
export const LEGACY_TOOLKIT_MAP: Record<string, string> = {
  google_sheets: "googlesheets",
  gmail: "gmail",
  slack: "slack",
  telegram: "telegram",
  canva: "canva",
};

export function toComposioToolkitSlug(connectorId: string): string {
  return LEGACY_TOOLKIT_MAP[connectorId] ?? connectorId;
}
