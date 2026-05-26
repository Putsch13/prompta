import { getComposioClient, isComposioEnabled } from "./client";

export interface ComposioToolkitEntry {
  id: string;
  label: string;
  category: string;
  popular: boolean;
  authType: "oauth" | "api_key";
  connectorId: string;
  logo?: string;
}

export interface ComposioToolEntry {
  slug: string;
  name: string;
  toolkit: string;
  description?: string;
  inputs: { key: string; label: string; required: boolean; type?: string }[];
}

const POPULAR_SLUGS = new Set([
  "gmail",
  "googlesheets",
  "slack",
  "notion",
  "github",
  "hubspot",
  "telegram",
  "canva",
  "linkedin",
  "airtable",
  "trello",
  "discord",
]);

const CATEGORY_LABELS: Record<string, string> = {
  "collaboration-&-communication": "Messagerie",
  "productivity-&-project-management": "Productivité",
  "crm": "CRM / Sales",
  "marketing-&-social-media": "Réseaux sociaux",
  "developer-tools-&-devops": "Dev",
  "design-&-creative-tools": "Design",
  "ai-&-machine-learning": "IA",
  "finance-&-accounting": "Finance",
  "e-commerce": "E-commerce / Web",
  "analytics-&-data": "Recherche / Data",
};

let toolkitCache: { at: number; items: ComposioToolkitEntry[] } | null = null;
const toolCache = new Map<string, { at: number; items: ComposioToolEntry[] }>();
const CACHE_MS = 15 * 60 * 1000;

function categoryLabel(raw?: unknown): string {
  if (!raw) return "Autre";
  const key =
    typeof raw === "string"
      ? raw
      : typeof raw === "object" && raw !== null && "slug" in raw
        ? String((raw as { slug?: string }).slug ?? "")
        : typeof raw === "object" && raw !== null && "name" in raw
          ? String((raw as { name?: string }).name ?? "")
          : String(raw);
  if (!key) return "Autre";
  return CATEGORY_LABELS[key.toLowerCase()] ?? key.replace(/-/g, " ");
}

function parseToolInputs(
  parameters: Record<string, unknown> | undefined
): ComposioToolEntry["inputs"] {
  const props = (parameters?.properties ?? {}) as Record<
    string,
    { title?: string; description?: string; type?: string }
  >;
  const required = new Set((parameters?.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([key, meta]) => ({
    key,
    label: meta.title ?? meta.description ?? key,
    required: required.has(key),
    type: meta.type,
  }));
}

export async function listComposioToolkits(): Promise<ComposioToolkitEntry[]> {
  if (!isComposioEnabled()) return [];

  const now = Date.now();
  if (toolkitCache && now - toolkitCache.at < CACHE_MS) {
    return toolkitCache.items;
  }

  const composio = getComposioClient();
  const raw = await composio.toolkits.get({ limit: 500 });
  const list = Array.isArray(raw) ? raw : (raw as { items?: typeof raw }).items ?? [];

  const items: ComposioToolkitEntry[] = list.map((tk) => {
    const slug = tk.slug ?? tk.name?.toLowerCase().replace(/\s+/g, "") ?? "unknown";
    const authScheme = tk.authSchemes?.[0] ?? "OAUTH2";
    const categories = (tk.meta as { categories?: string[] } | undefined)?.categories;
    return {
      id: slug,
      label: tk.name ?? slug,
      category: categoryLabel(categories?.[0]),
      popular: POPULAR_SLUGS.has(slug),
      authType: authScheme === "API_KEY" ? "api_key" : "oauth",
      connectorId: slug,
      logo: (tk.meta as { logo?: string } | undefined)?.logo,
    };
  });

  toolkitCache = { at: now, items };
  return items;
}

export async function listComposioTools(toolkitSlug: string): Promise<ComposioToolEntry[]> {
  if (!isComposioEnabled()) return [];

  const now = Date.now();
  const cached = toolCache.get(toolkitSlug);
  if (cached && now - cached.at < CACHE_MS) return cached.items;

  const composio = getComposioClient();
  const tools = await composio.tools.getRawComposioTools({
    toolkits: [toolkitSlug],
    limit: 100,
  });

  const items: ComposioToolEntry[] = (tools ?? []).map((t) => ({
    slug: t.slug ?? t.name ?? "",
    name: t.name ?? t.slug ?? "",
    toolkit: toolkitSlug,
    description: t.description,
    inputs: parseToolInputs(t.inputParameters as Record<string, unknown> | undefined),
  }));

  toolCache.set(toolkitSlug, { at: now, items });
  return items;
}
