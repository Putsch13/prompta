import { Composio } from "@composio/core";
import { LEGACY_TOOLKIT_MAP, toComposioToolkitSlug } from "@/lib/connectors/resolve-id";

export { LEGACY_TOOLKIT_MAP, toComposioToolkitSlug };

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
