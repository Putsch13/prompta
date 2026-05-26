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

export interface CategorySeed {
  slug: string;
  name: string;
  icon?: string;
}

/** Catégories marketplace — seed DB + fallback wizard. */
export const BUILDER_CATEGORIES: CategorySeed[] = [
  { slug: "marketing", name: "Marketing", icon: "📣" },
  { slug: "ventes", name: "Ventes", icon: "💼" },
  { slug: "support-client", name: "Support client", icon: "🎧" },
  { slug: "rh-recrutement", name: "RH / Recrutement", icon: "👥" },
  { slug: "finance", name: "Finance", icon: "💰" },
  { slug: "juridique", name: "Juridique", icon: "⚖️" },
  { slug: "productivite", name: "Productivité", icon: "⚡" },
  { slug: "redaction", name: "Rédaction", icon: "✍️" },
  { slug: "seo", name: "SEO", icon: "🔍" },
  { slug: "reseaux-sociaux", name: "Réseaux sociaux", icon: "📱" },
  { slug: "email", name: "Email", icon: "📧" },
  { slug: "e-commerce", name: "E-commerce", icon: "🛒" },
  { slug: "analyse-donnees", name: "Analyse de données", icon: "📊" },
  { slug: "developpement", name: "Développement", icon: "💻" },
  { slug: "devops", name: "DevOps", icon: "🔧" },
  { slug: "cybersecurite", name: "Cybersécurité", icon: "🔒" },
  { slug: "education", name: "Éducation", icon: "🎓" },
  { slug: "sante", name: "Santé", icon: "🏥" },
  { slug: "immobilier", name: "Immobilier", icon: "🏠" },
  { slug: "tourisme", name: "Tourisme", icon: "✈️" },
  { slug: "design", name: "Design", icon: "🎨" },
  { slug: "video", name: "Vidéo", icon: "🎬" },
  { slug: "audio-podcast", name: "Audio / Podcast", icon: "🎙️" },
  { slug: "traduction", name: "Traduction", icon: "🌐" },
  { slug: "recherche", name: "Recherche", icon: "🔬" },
  { slug: "strategie", name: "Stratégie", icon: "🎯" },
  { slug: "gestion-projet", name: "Gestion de projet", icon: "📋" },
  { slug: "crm", name: "CRM", icon: "🤝" },
  { slug: "automatisation", name: "Automatisation", icon: "🤖" },
  { slug: "chatbot", name: "Chatbot", icon: "💬" },
  { slug: "assistant-personnel", name: "Assistant personnel", icon: "🧑‍💼" },
  { slug: "veille", name: "Veille", icon: "👁️" },
  { slug: "analyse-concurrentielle", name: "Analyse concurrentielle", icon: "📈" },
  { slug: "generation-leads", name: "Génération de leads", icon: "🧲" },
  { slug: "onboarding", name: "Onboarding", icon: "🚀" },
  { slug: "formation", name: "Formation", icon: "📚" },
  { slug: "coaching", name: "Coaching", icon: "🏋️" },
  { slug: "redaction-technique", name: "Rédaction technique", icon: "📝" },
  { slug: "documentation", name: "Documentation", icon: "📄" },
  { slug: "tests-qa", name: "Tests / QA", icon: "✅" },
  { slug: "intelligence-business", name: "Intelligence business", icon: "💡" },
  { slug: "supply-chain", name: "Supply chain", icon: "📦" },
  { slug: "logistique", name: "Logistique", icon: "🚚" },
  { slug: "restauration", name: "Restauration", icon: "🍽️" },
  { slug: "agroalimentaire", name: "Agroalimentaire", icon: "🌾" },
  { slug: "mode-retail", name: "Mode / Retail", icon: "👗" },
  { slug: "sport-fitness", name: "Sport / Fitness", icon: "🏃" },
  { slug: "gaming", name: "Gaming", icon: "🎮" },
  { slug: "juridique-conformite", name: "Conformité", icon: "📜" },
  { slug: "autre", name: "Autre", icon: "📁" },
];

// ─────────────────────────────────────────────────────────────────────────────
export const AI_MODELS: ModelEntry[] = [
  // OpenAI — GPT-5.x (IDs réels : pas de suffixe -turbo)
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "OpenAI",
    apiModel: "gpt-5.5",
    tokenParam: "max_completion_tokens",
    popular: true,
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "OpenAI",
    apiModel: "gpt-5.4",
    tokenParam: "max_completion_tokens",
    popular: true,
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    provider: "OpenAI",
    apiModel: "gpt-5.4-mini",
    tokenParam: "max_completion_tokens",
    popular: false,
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    provider: "OpenAI",
    apiModel: "gpt-5.4-nano",
    tokenParam: "max_completion_tokens",
    popular: false,
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    provider: "OpenAI",
    apiModel: "gpt-5-mini",
    tokenParam: "max_completion_tokens",
    popular: false,
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 nano",
    provider: "OpenAI",
    apiModel: "gpt-5-nano",
    tokenParam: "max_completion_tokens",
    popular: false,
  },
  // OpenAI — GPT-4.1 (legacy, encore disponible)
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    provider: "OpenAI",
    apiModel: "gpt-4.1",
    tokenParam: "max_completion_tokens",
    popular: false,
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    provider: "OpenAI",
    apiModel: "gpt-4.1-mini",
    tokenParam: "max_completion_tokens",
    popular: false,
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    provider: "OpenAI",
    apiModel: "gpt-4.1-nano",
    tokenParam: "max_completion_tokens",
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
  {
    id: "o4-mini",
    label: "o4-mini",
    provider: "OpenAI",
    apiModel: "o4-mini",
    tokenParam: "max_completion_tokens",
    popular: false,
  },

  // Anthropic — Famille Claude 4.x (IDs alias officiels)
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    provider: "Anthropic",
    apiModel: "claude-opus-4-7",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    provider: "Anthropic",
    apiModel: "claude-opus-4-6",
    tokenParam: "max_tokens",
    popular: false,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "Anthropic",
    apiModel: "claude-sonnet-4-6",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "Anthropic",
    apiModel: "claude-haiku-4-5",
    tokenParam: "max_tokens",
    popular: false,
  },

  // Google — Gemini (IDs vérifiés mai 2026)
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "Google",
    apiModel: "gemini-3.5-flash",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "Google",
    apiModel: "gemini-2.5-pro",
    tokenParam: "max_tokens",
    popular: true,
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "Google",
    apiModel: "gemini-2.5-flash",
    tokenParam: "max_tokens",
    popular: false,
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
];

// Mapping des anciens IDs vers les nouveaux (pour migration + compat)
export const LEGACY_MODEL_MAP: Record<string, string> = {
  // Legacy OpenAI
  "gpt-4o": "gpt-4.1",
  "gpt-4o-mini": "gpt-4.1-mini",
  "gpt-4.1": "gpt-4.1",
  "o1": "o3",
  // Anciens slugs inventés (code Prompta pré-fix)
  "gpt-5.5-turbo": "gpt-5.5",
  "gpt-5.4-turbo": "gpt-5.4",
  // Anthropic legacy
  "claude-opus": "claude-opus-4-7",
  "claude-sonnet": "claude-sonnet-4-6",
  "claude-haiku": "claude-haiku-4-5",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
  "claude-3-opus-20240229": "claude-opus-4-7",
  "claude-opus-4-7-20260501": "claude-opus-4-7",
  "claude-opus-4-6-20260315": "claude-opus-4-6",
  "claude-sonnet-4-6-20260401": "claude-sonnet-4-6",
  "claude-haiku-4-5-20260201": "claude-haiku-4-5",
  "claude-haiku-4-5-20251001": "claude-haiku-4-5",
  // Google legacy
  "gemini-2.5-pro": "gemini-2.5-pro",
  "gemini-2.0-flash": "gemini-2.5-flash",
  "gemini-3.0-flash": "gemini-2.5-flash",
  "gemini-3.1-pro": "gemini-2.5-pro",
  "gemini-3-flash": "gemini-3.5-flash",
  "gemini-3-flash-preview": "gemini-3.5-flash",
  // Autres
  "llama-3.3": "gpt-5.4-mini",
  grok: "gpt-5.4-mini",
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

/** Modèles recommandés pour la génération IA du builder (plan / squelette). */
export function getBuilderModels(): ModelEntry[] {
  const ids = new Set([
    "gpt-5.4-mini",
    "gpt-5.4",
    "gpt-5.5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "mistral-small",
  ]);
  return getGatewayModels().filter((m) => ids.has(m.id));
}

/** Modèles exécutables via la passerelle (4 fournisseurs supportés). */
export function getGatewayModels(): ModelEntry[] {
  const supported = new Set(["OpenAI", "Anthropic", "Google", "Mistral"]);
  return AI_MODELS.filter((m) => supported.has(m.provider));
}

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
