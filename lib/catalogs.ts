/**
 * Catalogues techniques pour les builders.
 * Ces listes structurées remplacent les saisies en texte libre.
 */

export interface CatalogEntry {
  id: string;
  label: string;
  popular: boolean;
}

export interface ModelEntry extends CatalogEntry {
  provider: string;
}

export interface IntegrationEntry extends CatalogEntry {
  category: string;
  requiresKey?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODELES IA
// ─────────────────────────────────────────────────────────────────────────────
export const AI_MODELS: ModelEntry[] = [
  // OpenAI
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", popular: true },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI", popular: true },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "OpenAI", popular: false },
  { id: "o1", label: "o1", provider: "OpenAI", popular: false },
  { id: "o3-mini", label: "o3-mini", provider: "OpenAI", popular: false },
  // Anthropic
  { id: "claude-opus", label: "Claude Opus", provider: "Anthropic", popular: true },
  { id: "claude-sonnet", label: "Claude Sonnet", provider: "Anthropic", popular: true },
  { id: "claude-haiku", label: "Claude Haiku", provider: "Anthropic", popular: false },
  // Google
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", popular: true },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google", popular: false },
  // Mistral
  { id: "mistral-large", label: "Mistral Large", provider: "Mistral", popular: false },
  { id: "mistral-small", label: "Mistral Small", provider: "Mistral", popular: false },
  // Meta
  { id: "llama-3.3", label: "Llama 3.3", provider: "Meta", popular: false },
  // DeepSeek
  { id: "deepseek-v3", label: "DeepSeek V3", provider: "DeepSeek", popular: false },
  { id: "deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek", popular: false },
  // xAI
  { id: "grok", label: "Grok", provider: "xAI", popular: false },
];

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
  // Productivité
  { id: "notion", label: "Notion", category: "Productivité", popular: true },
  { id: "google-sheets", label: "Google Sheets", category: "Productivité", popular: true },
  { id: "google-docs", label: "Google Docs", category: "Productivité", popular: false },
  { id: "google-drive", label: "Google Drive", category: "Productivité", popular: false },
  { id: "airtable", label: "Airtable", category: "Productivité", popular: false },
  { id: "microsoft-365", label: "Microsoft 365", category: "Productivité", popular: false },
  // Design
  { id: "canva", label: "Canva", category: "Design", popular: true, requiresKey: true },
  { id: "figma", label: "Figma", category: "Design", popular: false },
  { id: "adobe-express", label: "Adobe Express", category: "Design", popular: false },
  // Communication
  { id: "slack", label: "Slack", category: "Communication", popular: true },
  { id: "discord", label: "Discord", category: "Communication", popular: false },
  { id: "gmail", label: "Gmail", category: "Communication", popular: false },
  { id: "ms-teams", label: "MS Teams", category: "Communication", popular: false },
  // CRM / Sales
  { id: "hubspot", label: "HubSpot", category: "CRM / Sales", popular: true },
  { id: "salesforce", label: "Salesforce", category: "CRM / Sales", popular: false },
  { id: "pipedrive", label: "Pipedrive", category: "CRM / Sales", popular: false },
  // Dev
  { id: "github", label: "GitHub", category: "Dev", popular: true },
  { id: "gitlab", label: "GitLab", category: "Dev", popular: false },
  { id: "linear", label: "Linear", category: "Dev", popular: false },
  { id: "jira", label: "Jira", category: "Dev", popular: false },
  // Automatisation
  { id: "zapier", label: "Zapier", category: "Automatisation", popular: false },
  { id: "make", label: "Make", category: "Automatisation", popular: false },
  { id: "n8n", label: "n8n", category: "Automatisation", popular: false },
  // Web / e-commerce
  { id: "shopify", label: "Shopify", category: "Web / e-commerce", popular: false },
  { id: "wordpress", label: "WordPress", category: "Web / e-commerce", popular: false },
  { id: "webflow", label: "Webflow", category: "Web / e-commerce", popular: false },
  // Réseaux
  { id: "linkedin", label: "LinkedIn", category: "Réseaux sociaux", popular: false },
  { id: "x-twitter", label: "X (Twitter)", category: "Réseaux sociaux", popular: false },
  { id: "instagram", label: "Instagram", category: "Réseaux sociaux", popular: false },
  { id: "youtube", label: "YouTube", category: "Réseaux sociaux", popular: false },
  // Recherche (nécessite clé)
  { id: "serper", label: "Serper (Search)", category: "Recherche", popular: false, requiresKey: true },
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
  return INTEGRATIONS.filter((i) => ids.includes(i.id) && i.requiresKey);
}
