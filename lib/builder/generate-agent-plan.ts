import { z } from "zod";
import { callModel } from "@/lib/llm/gateway";
import type { ResolvedModel } from "@/lib/llm/resolve-model";

// ─── Schema du plan généré par IA ────────────────────────────────────────────

export const GeneratedAgentPlanSchema = z.object({
  kind: z.enum(["prompt", "workflow", "agent"]),
  title: z.string(),
  description: z.string(),
  objective: z.string(),
  variables: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(["text", "number", "boolean", "json", "file", "url", "email"]).default("text"),
    required: z.boolean().default(true),
  })).default([]),
  requiredConnectors: z.array(z.object({
    connectorId: z.string(),
    reason: z.string(),
    requiredActions: z.array(z.string()).default([]),
  })).default([]),
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
  })).min(1).max(15),
  triggers: z.array(z.object({
    type: z.enum(["manual", "schedule", "webhook", "email", "app_event"]),
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
  "variables": [{ "key": "...", "label": "...", "type": "text", "required": true }],
  "requiredConnectors": [{ "connectorId": "gmail", "reason": "...", "requiredActions": ["read_email"] }],
  "steps": [{
    "id": "read_emails",
    "type": "action",
    "name": "Lire les emails",
    "description": "...",
    "outputKey": "read_emails",
    "connectorId": "gmail",
    "actionSlug": "read_email",
    "riskLevel": "low",
    "requiresApproval": false
  }, {
    "id": "analyze",
    "type": "llm",
    "name": "Analyser",
    "description": "...",
    "outputKey": "analysis",
    "riskLevel": "low",
    "requiresApproval": false
  }],
  "triggers": [{ "type": "manual" }],
  "policies": { "maxIterations": 1, "requireHumanApprovalForExternalActions": true }
}`;

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
  const plan = GeneratedAgentPlanSchema.parse(raw);
  return plan;
}
