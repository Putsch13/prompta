import { z } from "zod";
import { callModel } from "@/lib/llm/gateway";
import type { ResolvedModel } from "@/lib/llm/resolve-model";

// ─── Normalisation types variables (IA renvoie souvent textarea/string/…) ───

const ALLOWED_VAR_TYPES = ["text", "number", "boolean", "json", "file", "url", "email"] as const;
export type PlanVariableType = (typeof ALLOWED_VAR_TYPES)[number];

const VARIABLE_TYPE_ALIASES: Record<string, PlanVariableType> = {
  string: "text",
  textarea: "text",
  texte: "text",
  str: "text",
  longtext: "text",
  int: "number",
  integer: "number",
  float: "number",
  numeric: "number",
  bool: "boolean",
  list: "json",
  array: "json",
  object: "json",
  document: "file",
  attachment: "file",
  uri: "url",
  link: "url",
  mail: "email",
  "e-mail": "email",
  email_address: "email",
};

/** Normalise un type de variable IA → valeur acceptée par le schéma. */
export function normalizePlanVariableType(raw: unknown): PlanVariableType {
  if (typeof raw !== "string") return "text";
  const lower = raw.toLowerCase().trim();
  if ((ALLOWED_VAR_TYPES as readonly string[]).includes(lower)) {
    return lower as PlanVariableType;
  }
  return VARIABLE_TYPE_ALIASES[lower] ?? "text";
}

// ─── Normalisation types trigger (IA renvoie cron, form, api, …) ───

const ALLOWED_TRIGGER_TYPES = [
  "manual",
  "schedule",
  "webhook",
  "email",
  "app_event",
] as const;
export type PlanTriggerType = (typeof ALLOWED_TRIGGER_TYPES)[number];

const TRIGGER_TYPE_ALIASES: Record<string, PlanTriggerType> = {
  cron: "schedule",
  scheduled: "schedule",
  schedule_cron: "schedule",
  timer: "schedule",
  periodic: "schedule",
  recurring: "schedule",
  interval: "schedule",
  time: "schedule",
  api: "webhook",
  http: "webhook",
  http_webhook: "webhook",
  callback: "webhook",
  hook: "webhook",
  incoming_webhook: "webhook",
  gmail: "email",
  mail: "email",
  inbox: "email",
  incoming_email: "email",
  email_received: "email",
  event: "app_event",
  integration: "app_event",
  app: "app_event",
  connector: "app_event",
  slack_event: "app_event",
  form: "manual",
  button: "manual",
  user: "manual",
  user_initiated: "manual",
  on_demand: "manual",
  automatic: "manual",
  default: "manual",
  none: "manual",
};

/** Normalise un type de trigger IA → valeur acceptée par le schéma. */
export function normalizePlanTriggerType(raw: unknown): PlanTriggerType {
  if (typeof raw !== "string") return "manual";
  const lower = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if ((ALLOWED_TRIGGER_TYPES as readonly string[]).includes(lower)) {
    return lower as PlanTriggerType;
  }
  return TRIGGER_TYPE_ALIASES[lower] ?? "manual";
}

function normalizeTriggers(raw: unknown): { type: PlanTriggerType; config?: Record<string, unknown> }[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ type: "manual" }];
  }

  const seen = new Set<PlanTriggerType>();
  const normalized: { type: PlanTriggerType; config?: Record<string, unknown> }[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const type = normalizePlanTriggerType(entry.type);
    if (seen.has(type)) continue;
    seen.add(type);
    const config =
      entry.config && typeof entry.config === "object" && !Array.isArray(entry.config)
        ? (entry.config as Record<string, unknown>)
        : undefined;
    normalized.push(config ? { type, config } : { type });
  }

  return normalized.length > 0 ? normalized : [{ type: "manual" }];
}

/** Pré-traitement du JSON brut IA avant validation Zod. */
export function coerceGeneratedPlanRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const plan = { ...(raw as Record<string, unknown>) };

  if (Array.isArray(plan.variables)) {
    plan.variables = plan.variables.map((v) => {
      if (!v || typeof v !== "object") return v;
      const entry = v as Record<string, unknown>;
      return {
        ...entry,
        type: normalizePlanVariableType(entry.type),
        required: entry.required !== false,
      };
    });
  }

  plan.triggers = normalizeTriggers(plan.triggers);

  return plan;
}

// ─── Schema du plan généré par IA ────────────────────────────────────────────

export const GeneratedAgentPlanSchema = z.object({
  kind: z.enum(["prompt", "workflow", "agent"]),
  title: z.string(),
  description: z.string(),
  objective: z.string(),
  variables: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.preprocess(
      (val) => normalizePlanVariableType(val),
      z.enum(["text", "number", "boolean", "json", "file", "url", "email"]),
    ).default("text"),
    required: z.boolean().default(true),
    help: z.string().optional(),
  })).default([]),
  requiredConnectors: z.array(z.object({
    connectorId: z.string(),
    reason: z.string(),
    requiredActions: z.array(z.string()).default([]),
  })).default([]),
  entryStepId: z.string().optional(),
  steps: z.array(z.object({
    id: z.string(),
    type: z.enum(["llm", "action", "tool", "code", "condition", "approval"]),
    name: z.string(),
    description: z.string(),
    inputMapping: z.record(z.string(), z.any()).optional(),
    outputKey: z.string(),
    outputSchema: z.any().optional(),
    connectorId: z.string().optional(),
    toolkitSlug: z.string().optional(),
    actionSlug: z.string().optional(),
    riskLevel: z.enum(["low", "medium", "high"]).default("low"),
    requiresApproval: z.boolean().default(false),
    next: z.array(z.string()).optional(),
    branchLabel: z.string().optional(),
  })).min(1).max(15),
  triggers: z.array(z.object({
    type: z.preprocess(
      (val) => normalizePlanTriggerType(val),
      z.enum(["manual", "schedule", "webhook", "email", "app_event"]),
    ),
    config: z.record(z.string(), z.any()).optional(),
  })).default([{ type: "manual" }]),
  policies: z
    .object({
      maxIterations: z.number().default(1),
      budgetCents: z.number().optional(),
      requireHumanApprovalForExternalActions: z.boolean().default(true),
      memoryEnabled: z.boolean().default(false),
    })
    .default({ maxIterations: 1, requireHumanApprovalForExternalActions: true, memoryEnabled: false }),
  memory: z
    .object({
      enabled: z.boolean().default(false),
      maxMemories: z.number().default(10),
    })
    .optional(),
});

export type GeneratedAgentPlan = z.infer<typeof GeneratedAgentPlanSchema>;

export function parseGeneratedAgentPlan(raw: unknown): GeneratedAgentPlan {
  return GeneratedAgentPlanSchema.parse(coerceGeneratedPlanRaw(raw));
}

// ─── Catalogue d'actions compressé pour le prompt ────────────────────────────

const COMPOSIO_CATALOG_COMPRESSED = `
gmail: read_email, send_email, search_email, list_labels
google_sheets: read_sheet, append_row, update_cell, create_sheet
google_drive: list_files, read_file, upload_file, search_files
slack: send_message, list_channels, read_channel, create_channel
hubspot: create_contact, update_contact, create_deal, search_contacts, list_deals
notion: create_page, search_pages, read_page, update_page, create_database
github: create_issue, search_repos, list_pulls, create_comment
shopify: list_orders, get_order, list_products, create_product
stripe: list_payments, get_customer, create_invoice
jira: create_issue, search_issues, update_issue
linear: create_issue, list_issues, update_issue
zendesk: create_ticket, search_tickets, update_ticket
telegram: send_message
canva: create_design
linkedin: create_post
twitter: create_tweet
facebook: create_post
instagram: create_post
airtable: get_record, update_record, create_record
`;

// ─── Génération du plan ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un architecte d'agents IA expert pour Prompta.
Tu dois produire un plan exécutable au format JSON.

Règles strictes :
1. Si une app externe est nécessaire, ajoute-la dans requiredConnectors.
2. Si une action écrit/modifie/envoie quelque chose, mets riskLevel "high" et requiresApproval true.
3. Ne génère PAS seulement des steps LLM. Utilise action/tool/code quand pertinent.
4. Chaque step doit avoir un outputKey unique et descriptif (snake_case).
5. Les steps LLM utilisent les modèles : gpt-5.4, gpt-5.4-mini, claude-sonnet-4-6, claude-haiku-4-5.
6. Les steps tool utilisent : web_search, http_fetch, file_read.
7. Les steps action référencent un connectorId + actionSlug du catalogue.
8. Les steps condition comparent des outputs précédents.
9. Les steps approval bloquent avant une action risquée.
10. kind = "prompt" si un seul step LLM, "workflow" si déterministe, "agent" si besoin de décisions.
11. Chaque variable doit avoir un champ "help" avec un exemple concret (ex. ID Sheets depuis l'URL, nom d'expéditeur Gmail sans mot de passe).
12. Pour exécuter plusieurs actions en parallèle (ex. publier sur plusieurs réseaux), crée un step amont puis fais pointer son champ "next" vers tous les steps parallèles.
13. Pour un embranchement conditionnel, crée un step condition dont "next" liste les steps de chaque branche ; mets "branchLabel" sur chaque step cible (ex. "si urgent", "sinon").
14. "entryStepId" = id du premier step (défaut : steps[0].id). Sans "next" explicite, les steps sont chaînés séquentiellement.
15. Pour chaque step action, mappe ses paramètres requis dans "inputMapping" soit à une sortie d'étape ({{outputKey}}), soit à une variable d'entrée {{snake_case}} déclarée aussi dans "variables". Ne mets JAMAIS de valeur réelle (email, nom, clé) en dur.
16. "entryStepId" = l'unique step sans prédécesseur (aucun autre step ne le liste dans "next").
17. Si le step B référence {{outputKey_de_A}} dans son prompt ou inputMapping, alors A précède B (A doit apparaître dans la chaîne "next" menant à B).
18. Tout step doit être atteignable depuis entryStepId. Aucun nœud orphelin.
19. Chaque variable "type" doit être exactement : text | number | boolean | json | file | url | email (pas "string", "textarea", etc.).
20. "triggers" : tableau de { "type": "manual" | "schedule" | "webhook" | "email" | "app_event" } uniquement — pas "cron", "form", "api", etc. Par défaut [{ "type": "manual" }].

Catalogue d'actions disponibles :
${COMPOSIO_CATALOG_COMPRESSED}

Réponds UNIQUEMENT avec du JSON valide, sans markdown.`;

export async function generateAgentPlan(
  description: string,
  apiKey: string,
  resolved: ResolvedModel
): Promise<GeneratedAgentPlan> {
  if (!apiKey) {
    throw new Error("Clé API requise pour la génération de plan IA.");
  }

  const userPrompt = `L'utilisateur décrit ce qu'il veut :
"${description}"

Génère un plan JSON complet avec cette structure :
{
  "kind": "prompt" | "workflow" | "agent",
  "title": "...",
  "description": "...",
  "objective": "...",
  "variables": [{ "key": "destinataire_email", "label": "Email du destinataire", "type": "email", "required": true }],
  "requiredConnectors": [{ "connectorId": "gmail", "reason": "...", "requiredActions": ["gmail.send"] }],
  "entryStepId": "analyze",
  "steps": [{
    "id": "analyze",
    "type": "llm",
    "name": "Analyser et préparer",
    "description": "Analyse le contexte et prépare le contenu de l'email",
    "outputKey": "analyze_output",
    "riskLevel": "low",
    "requiresApproval": false,
    "next": ["prepare_email"]
  }, {
    "id": "prepare_email",
    "type": "llm",
    "name": "Préparer l'email",
    "description": "Rédige subject et body à partir de {{analyze_output}}",
    "outputKey": "prepare_email_output",
    "riskLevel": "low",
    "requiresApproval": false,
    "next": ["send_email"]
  }, {
    "id": "send_email",
    "type": "action",
    "name": "Envoyer via Gmail",
    "description": "Envoie l'email préparé",
    "outputKey": "send_result",
    "connectorId": "gmail",
    "actionSlug": "gmail.send",
    "inputMapping": {
      "to": "{{destinataire_email}}",
      "subject": "{{prepare_email_output}}",
      "body": "{{prepare_email_output}}"
    },
    "riskLevel": "high",
    "requiresApproval": true
  }],
  "triggers": [{ "type": "manual" }],
  "policies": { "maxIterations": 1, "requireHumanApprovalForExternalActions": true }
}

Pour un cas parallèle (publication multi-réseaux), le step amont liste plusieurs ids dans "next" et chaque cible a un "branchLabel".`;

  const result = await callModel({
    provider: resolved.provider,
    model: resolved.apiModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    apiKey,
    maxTokens: 3000,
    tokenParam: resolved.tokenParam,
  });

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Le modèle n'a pas retourné de JSON valide.");
  }

  const raw = JSON.parse(jsonMatch[0]);
  return parseGeneratedAgentPlan(raw);
}
