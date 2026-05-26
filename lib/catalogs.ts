/**
 * Catalogues techniques pour les builders.
 * Ces listes structurées remplacent les saisies en texte libre.
 */

export interface CatalogEntry {
  id: string;
  label: string;
  popular: boolean;
}

export type TokenParam = "max_tokens" | "max_completion_tokens";

export interface ModelEntry extends CatalogEntry {
  provider: string;
  apiModel: string;
  tokenParam: TokenParam;
}

export interface IntegrationEntry extends CatalogEntry {
  category: string;
  requiresKey?: boolean;
  authType?: "oauth" | "api_key" | "none";
  connectorId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODELES IA — Mai 2026 (IDs API réels)
// ─────────────────────────────────────────────────────────────────────────────
export const AI_MODELS: ModelEntry[] = [
  // OpenAI — Famille GPT-5.x (gpt-4o/gpt-4o-mini retirés)
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "OpenAI",
    apiModel: "gpt-5.5-turbo",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "OpenAI",
    apiModel: "gpt-5.4-turbo",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    provider: "OpenAI",
    apiModel: "gpt-5.4-mini",
    tokenParam: "max_tokens",
    popular: false,
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    provider: "OpenAI",
    apiModel: "gpt-5-mini",
    tokenParam: "max_tokens",
    popular: false,
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 nano",
    provider: "OpenAI",
    apiModel: "gpt-5-nano",
    tokenParam: "max_tokens",
    popular: false,
  },
  // OpenAI — Modèles de raisonnement (o-series)
  {
    id: "o3",
    label: "o3",
    provider: "OpenAI",
    apiModel: "o3",
    tokenParam: "max_completion_tokens",
    popular: false,
  },
  {
    id: "o3-mini",
    label: "o3-mini",
    provider: "OpenAI",
    apiModel: "o3-mini",
    tokenParam: "max_completion_tokens",
    popular: false,
  },

  // Anthropic — Famille Claude 4.x (Claude 3.x retirés)
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    provider: "Anthropic",
    apiModel: "claude-opus-4-7-20260501",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    provider: "Anthropic",
    apiModel: "claude-opus-4-6-20260315",
    tokenParam: "max_tokens",
    popular: false,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "Anthropic",
    apiModel: "claude-sonnet-4-6-20260401",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "Anthropic",
    apiModel: "claude-haiku-4-5-20260201",
    tokenParam: "max_tokens",
    popular: false,
  },

  // Google — Famille Gemini 3.x
  {
    id: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    provider: "Google",
    apiModel: "gemini-3.1-pro",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "gemini-3-flash",
    label: "Gemini 3 Flash",
    provider: "Google",
    apiModel: "gemini-3.0-flash",
    tokenParam: "max_tokens",
    popular: true,
  },

  // Mistral
  {
    id: "mistral-large",
    label: "Mistral Large",
    provider: "Mistral",
    apiModel: "mistral-large-latest",
    tokenParam: "max_tokens",
    popular: false,
  },
  {
    id: "mistral-medium",
    label: "Mistral Medium",
    provider: "Mistral",
    apiModel: "mistral-medium-latest",
    tokenParam: "max_tokens",
    popular: false,
  },
  {
    id: "mistral-small",
    label: "Mistral Small",
    provider: "Mistral",
    apiModel: "mistral-small-latest",
    tokenParam: "max_tokens",
    popular: false,
  },

  // Meta (via Together/Fireworks)
  {
    id: "llama-4",
    label: "Llama 4",
    provider: "Meta",
    apiModel: "meta-llama/Llama-4-70b",
    tokenParam: "max_tokens",
    popular: false,
  },

  // DeepSeek
  {
    id: "deepseek-v3",
    label: "DeepSeek V3",
    provider: "DeepSeek",
    apiModel: "deepseek-chat",
    tokenParam: "max_tokens",
    popular: false,
  },
  {
    id: "deepseek-r1",
    label: "DeepSeek R1",
    provider: "DeepSeek",
    apiModel: "deepseek-reasoner",
    tokenParam: "max_tokens",
    popular: false,
  },

  // xAI
  {
    id: "grok-3",
    label: "Grok 3",
    provider: "xAI",
    apiModel: "grok-3",
    tokenParam: "max_tokens",
    popular: false,
  },
];

// Mapping des anciens IDs vers les nouveaux (pour migration)
export const LEGACY_MODEL_MAP: Record<string, string> = {
  "gpt-4o": "gpt-5.4",
  "gpt-4o-mini": "gpt-5-mini",
  "gpt-4.1": "gpt-5.4",
  "o1": "o3",
  "claude-opus": "claude-opus-4-7",
  "claude-sonnet": "claude-sonnet-4-6",
  "claude-haiku": "claude-haiku-4-5",
  "gemini-2.5-pro": "gemini-3.1-pro",
  "gemini-2.0-flash": "gemini-3-flash",
  "llama-3.3": "llama-4",
  grok: "grok-3",
};

// ─────────────────────────────────────────────────────────────────────────────
// TECH / RUNTIME
// ─────────────────────────────────────────────────────────────────────────────
export const TECH_RUNTIMES: CatalogEntry[] = [
  { id: "none", label: "Aucun runtime requis", popular: true },
  { id: "node-18", label: "Node.js 18+", popular: true },
  { id: "node-20", label: "Node.js 20+", popular: true },
  { id: "python-3.10", label: "Python 3.10+", popular: true },
  { id: "python-3.11", label: "Python 3.11+", popular: false },
  { id: "deno", label: "Deno", popular: false },
  { id: "bun", label: "Bun", popular: false },
  { id: "docker", label: "Docker", popular: true },
  { id: "typescript", label: "TypeScript", popular: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATIONS / CONNECTEURS
// ─────────────────────────────────────────────────────────────────────────────
export const INTEGRATIONS: IntegrationEntry[] = [
  // Messagerie
  { id: "whatsapp", label: "WhatsApp", category: "Messagerie", popular: true, authType: "oauth" },
  { id: "telegram", label: "Telegram", category: "Messagerie", popular: true, authType: "api_key", connectorId: "telegram" },
  { id: "slack", label: "Slack", category: "Messagerie", popular: true, authType: "oauth", connectorId: "slack" },
  { id: "discord", label: "Discord", category: "Messagerie", popular: false, authType: "oauth" },
  { id: "ms-teams", label: "Microsoft Teams", category: "Messagerie", popular: false, authType: "oauth" },
  { id: "messenger", label: "Messenger", category: "Messagerie", popular: false, authType: "oauth" },
  { id: "twilio-sms", label: "SMS (Twilio)", category: "Messagerie", popular: false, requiresKey: true, authType: "api_key" },
  // Email
  { id: "gmail", label: "Gmail", category: "Email", popular: true, authType: "oauth", connectorId: "gmail" },
  { id: "outlook", label: "Outlook", category: "Email", popular: false, authType: "oauth" },
  { id: "resend", label: "Resend", category: "Email", popular: false, requiresKey: true, authType: "api_key" },
  { id: "sendgrid", label: "SendGrid", category: "Email", popular: false, requiresKey: true, authType: "api_key" },
  // Productivité
  { id: "notion", label: "Notion", category: "Productivité", popular: true, authType: "oauth" },
  { id: "google-sheets", label: "Google Sheets", category: "Productivité", popular: true, authType: "oauth", connectorId: "google_sheets" },
  { id: "google-docs", label: "Google Docs", category: "Productivité", popular: false, authType: "oauth" },
  { id: "google-drive", label: "Google Drive", category: "Productivité", popular: false, authType: "oauth" },
  { id: "airtable", label: "Airtable", category: "Productivité", popular: false, authType: "oauth" },
  { id: "clickup", label: "ClickUp", category: "Productivité", popular: false, authType: "oauth" },
  { id: "trello", label: "Trello", category: "Productivité", popular: false, authType: "oauth" },
  { id: "asana", label: "Asana", category: "Productivité", popular: false, authType: "oauth" },
  { id: "monday", label: "Monday", category: "Productivité", popular: false, authType: "oauth" },
  { id: "microsoft-365", label: "Microsoft 365", category: "Productivité", popular: false, authType: "oauth" },
  // CRM / Sales
  { id: "hubspot", label: "HubSpot", category: "CRM / Sales", popular: true, authType: "oauth" },
  { id: "salesforce", label: "Salesforce", category: "CRM / Sales", popular: false, authType: "oauth" },
  { id: "pipedrive", label: "Pipedrive", category: "CRM / Sales", popular: false, authType: "oauth" },
  { id: "zoho", label: "Zoho CRM", category: "CRM / Sales", popular: false, authType: "oauth" },
  // Design
  { id: "canva", label: "Canva", category: "Design", popular: true, authType: "oauth", connectorId: "canva" },
  { id: "figma", label: "Figma", category: "Design", popular: false, authType: "oauth" },
  { id: "adobe-express", label: "Adobe Express", category: "Design", popular: false, authType: "oauth" },
  // Dev
  { id: "github", label: "GitHub", category: "Dev", popular: true, authType: "oauth" },
  { id: "gitlab", label: "GitLab", category: "Dev", popular: false, authType: "oauth" },
  { id: "linear", label: "Linear", category: "Dev", popular: false, authType: "oauth" },
  { id: "jira", label: "Jira", category: "Dev", popular: false, authType: "oauth" },
  // Automatisation
  { id: "zapier", label: "Zapier", category: "Automatisation", popular: false, authType: "oauth" },
  { id: "make", label: "Make", category: "Automatisation", popular: false, authType: "oauth" },
  { id: "n8n", label: "n8n", category: "Automatisation", popular: false, authType: "oauth" },
  // E-commerce / Web
  { id: "shopify", label: "Shopify", category: "E-commerce / Web", popular: false, authType: "oauth" },
  { id: "woocommerce", label: "WooCommerce", category: "E-commerce / Web", popular: false, authType: "oauth" },
  { id: "wordpress", label: "WordPress", category: "E-commerce / Web", popular: false, authType: "oauth" },
  { id: "webflow", label: "Webflow", category: "E-commerce / Web", popular: false, authType: "oauth" },
  // Réseaux sociaux
  { id: "linkedin", label: "LinkedIn", category: "Réseaux sociaux", popular: false, authType: "oauth" },
  { id: "x-twitter", label: "X (Twitter)", category: "Réseaux sociaux", popular: false, authType: "oauth" },
  { id: "instagram", label: "Instagram", category: "Réseaux sociaux", popular: false, authType: "oauth" },
  { id: "youtube", label: "YouTube", category: "Réseaux sociaux", popular: false, authType: "oauth" },
  { id: "tiktok", label: "TikTok", category: "Réseaux sociaux", popular: false, authType: "oauth" },
  { id: "facebook", label: "Facebook", category: "Réseaux sociaux", popular: false, authType: "oauth" },
  // Recherche / Data
  { id: "serper", label: "Serper (Search)", category: "Recherche / Data", popular: false, requiresKey: true, authType: "api_key" },
  { id: "perplexity", label: "Perplexity", category: "Recherche / Data", popular: false, requiresKey: true, authType: "api_key" },
  { id: "google-search", label: "Google Search", category: "Recherche / Data", popular: false, authType: "oauth" },
  // Stockage
  { id: "dropbox", label: "Dropbox", category: "Stockage", popular: false, authType: "oauth" },
  { id: "gcs", label: "Google Cloud Storage", category: "Stockage", popular: false, authType: "oauth" },
  { id: "aws-s3", label: "AWS S3", category: "Stockage", popular: false, requiresKey: true, authType: "api_key" },
  // Agenda
  { id: "google-calendar", label: "Google Calendar", category: "Agenda", popular: false, authType: "oauth" },
  { id: "calendly", label: "Calendly", category: "Agenda", popular: false, authType: "oauth" },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Groupe les entrées par une clé (provider, category) */
export function groupBy<T extends { [key: string]: unknown }>(
  items: T[],
  key: keyof T
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = String(item[key]);
    const arr = map.get(groupKey) || [];
    arr.push(item);
    map.set(groupKey, arr);
  }
  return map;
}

/** Retourne les entrées populaires en premier */
export function getPopularFirst<T extends CatalogEntry>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
}

/** Trouve les intégrations qui nécessitent une clé API */
export function getIntegrationsRequiringKey(ids: string[]): IntegrationEntry[] {
  return INTEGRATIONS.filter((i) => ids.includes(i.id) && (i.requiresKey || i.authType === "api_key"));
}

/** Connecteurs OAuth requis par les intégrations sélectionnées */
export function getConnectorIdsFromIntegrations(ids: string[]): string[] {
  const set = new Set<string>();
  for (const i of INTEGRATIONS) {
    if (ids.includes(i.id) && i.connectorId) set.add(i.connectorId);
  }
  return Array.from(set);
}
