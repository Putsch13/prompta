import { getComposioClient, isComposioEnabled } from "./client";
import {
  composioResourceType,
  inferComposioResourceType,
  looksLikeResourceKey,
} from "@/lib/connectors/resource-types";

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
  inputs: {
    key: string;
    label: string;
    required: boolean;
    type?: "text" | "textarea" | "email";
    kind: "static" | "input" | "step_ref" | "resource" | "identity";
    resourceType?: string;
    defaultScope?: "builder_test" | "end_user" | "dynamic";
    dependsOn?: string;
    help?: string;
    /** Valeur par défaut déclarée par le JSON-schema de l'outil. */
    defaultValue?: string;
    /** Valeurs possibles (enum) déclarées par le schéma. */
    enumValues?: string[];
    /** Longueur max déclarée par le schéma (troncature côté garde). */
    maxLength?: number;
    /** Type JSON-schema brut (array/object/number…) — pour la coercition d'exécution. */
    rawType?: string;
  }[];
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

/** Devine un libellé lisible depuis une clé snake_case. */
function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Mappe un type JSON-schema + nom de clé → type de widget ActionInput. */
function widgetType(key: string, jsonType?: string): "text" | "textarea" | "email" {
  const k = key.toLowerCase();
  if (/email|recipient|sender/.test(k)) return "email";
  if (
    /body|message|content|text|description|prompt|html|markdown|note|comment/.test(k) ||
    jsonType === "object" ||
    jsonType === "array"
  ) {
    return "textarea";
  }
  return "text";
}

/**
 * Extrait les valeurs d'enum d'un schéma, y compris via composition
 * anyOf/oneOf (ex. design_type de Canva : anyOf[{enum:[...]}, {...}]) et
 * items.enum (tableaux d'enums). Export pour tests.
 */
export function collectSchemaEnum(meta: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(meta.enum)) return meta.enum.map((v) => String(v));
  const branches = (meta.anyOf ?? meta.oneOf) as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(branches)) {
    const vals: string[] = [];
    for (const b of branches) {
      if (!b || typeof b !== "object") continue;
      if (Array.isArray(b.enum)) vals.push(...b.enum.map((v) => String(v)));
      else if (b.const != null) vals.push(String(b.const));
      // objet { properties: { type: { enum } } } — préréglages nommés
      const props = b.properties as Record<string, { enum?: unknown[] }> | undefined;
      if (props?.type?.enum) vals.push(...props.type.enum.map((v) => String(v)));
    }
    if (vals.length > 0) return Array.from(new Set(vals));
  }
  const items = meta.items as Record<string, unknown> | undefined;
  if (items && Array.isArray(items.enum)) return items.enum.map((v) => String(v));
  return undefined;
}

function parseToolInputs(
  parameters: Record<string, unknown> | undefined,
  toolkit: string,
): ComposioToolEntry["inputs"] {
  const props = (parameters?.properties ?? {}) as Record<
    string,
    { title?: string; description?: string; type?: string; default?: unknown; enum?: unknown[]; maxLength?: number; anyOf?: unknown[]; oneOf?: unknown[]; items?: unknown }
  >;
  const required = new Set((parameters?.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([key, meta]) => {
    // default/enum/maxLength du schéma : servent au garde d'exécution
    // (auto-remplissage des requis triviaux, troncature des valeurs trop
    // longues — ex. un titre aiFill > 255 chars rejeté par Canva).
    const defaultValue =
      meta.default !== undefined && meta.default !== null ? String(meta.default) : undefined;
    const enumValues = collectSchemaEnum(meta as Record<string, unknown>);
    const maxLength = typeof meta.maxLength === "number" && meta.maxLength > 0 ? meta.maxLength : undefined;
    const rawType = typeof meta.type === "string" ? meta.type : undefined;
    // Curaté (mapping connu) prioritaire, sinon tout `*_id` devient une ressource
    // listable dynamiquement (picker universel sur les 300+ toolkits).
    const resourceType =
      inferComposioResourceType(key) ??
      (looksLikeResourceKey(key) ? composioResourceType(toolkit, key) : undefined);
    const label = meta.title?.trim() || humanizeKey(key);
    if (resourceType) {
      return {
        key,
        label,
        required: required.has(key),
        type: "text" as const,
        kind: "resource" as const,
        resourceType,
        defaultScope: "end_user" as const,
        help: meta.description,
        defaultValue,
        enumValues,
        maxLength,
        rawType,
      };
    }
    return {
      key,
      label,
      required: required.has(key),
      type: widgetType(key, meta.type),
      // `kind` toujours défini → ActionInput valide pour le contrat/résolveur.
      kind: "input" as const,
      defaultScope: "dynamic" as const,
      help: meta.description,
      defaultValue,
      enumValues,
      maxLength,
      rawType,
    };
  });
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
  // limit 100 tronquait les gros toolkits (GitHub, HubSpot… : centaines d'outils)
  // → actions légitimes déclarées « introuvables ».
  const tools = await composio.tools.getRawComposioTools({
    toolkits: [toolkitSlug],
    limit: 500,
  });

  const items: ComposioToolEntry[] = (tools ?? []).map((t) => ({
    slug: t.slug ?? t.name ?? "",
    name: t.name ?? t.slug ?? "",
    toolkit: toolkitSlug,
    description: t.description,
    inputs: parseToolInputs(t.inputParameters as Record<string, unknown> | undefined, toolkitSlug),
  }));

  toolCache.set(toolkitSlug, { at: now, items });
  return items;
}

/** Clés d'entrée réellement attendues par un outil Composio (depuis le catalogue). */
export async function getComposioToolInputKeys(
  toolkitSlug: string,
  toolSlug: string,
): Promise<string[]> {
  try {
    const tools = await listComposioTools(toolkitSlug);
    const entry = tools.find((t) => t.slug === toolSlug);
    return entry ? entry.inputs.map((i) => i.key) : [];
  } catch {
    return [];
  }
}

const canonKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Aligne les noms de paramètres fournis sur le schéma réel de l'outil Composio,
 * de façon générique (vaut pour les 300+ toolkits) : `spreadsheetId` →
 * `spreadsheet_id`, `recipientEmail` → `recipient_email`, etc. Ne renomme que
 * lorsqu'une clé attendue correspond à la forme canonique (casse/séparateurs
 * ignorés) ; sinon la clé est laissée telle quelle (best-effort, jamais destructif).
 */
export function alignArgKeysToSchema(
  params: Record<string, string>,
  expectedKeys: string[],
): Record<string, string> {
  if (expectedKeys.length === 0) return params;
  const byCanon = new Map(expectedKeys.map((k) => [canonKey(k), k]));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const target = byCanon.get(canonKey(k)) ?? k;
    out[target] = v;
  }
  return out;
}
