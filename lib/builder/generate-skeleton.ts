import { z } from "zod";
import { callModel } from "@/lib/llm/gateway";
import { getAgentTemplate, AGENT_TEMPLATES } from "@/lib/templates/agent-templates";
import type { AgentStep } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";

const GeneratedSkeletonSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  type: z.enum(["agent", "workflow"]),
  models: z.array(z.string()).min(1),
  tags: z.array(z.string()).max(8),
  integrations: z.array(z.string()).optional(),
  requiredSecrets: z.array(z.string()).optional(),
  envFields: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      required: z.boolean(),
      type: z.enum(["text", "textarea", "number", "file", "list"]).optional(),
      help: z.string().optional(),
    })
  ),
  steps: z.array(
    z.object({
      type: z.literal("llm"),
      model: z.string(),
      prompt: z.string().min(10),
    })
  ).min(1).max(6),
});

export type GeneratedSkeleton = z.infer<typeof GeneratedSkeletonSchema>;

const VALID_SECRETS = new Set<KeyProvider>(["openai", "anthropic", "google", "mistral", "serper"]);

function ruleBasedSkeleton(description: string): GeneratedSkeleton | null {
  const lower = description.toLowerCase();
  const pick =
    lower.includes("email") || lower.includes("mail")
      ? "email-pro"
      : lower.includes("linkedin") || lower.includes("post")
        ? "linkedin-post"
        : lower.includes("réunion") || lower.includes("reunion") || lower.includes("meeting")
          ? "meeting-summary"
          : lower.includes("support") || lower.includes("ticket") || lower.includes("client")
            ? "support-reply"
            : null;

  if (!pick) return null;
  const t = getAgentTemplate(pick)!;
  return {
    title: t.label,
    description: t.description,
    type: t.type,
    models: t.models,
    tags: t.tags,
    integrations: t.integrations,
    requiredSecrets: t.requiredSecrets,
    envFields: t.envFields,
    steps: t.steps.filter((s): s is Extract<AgentStep, { type: "llm" }> => s.type === "llm"),
  };
}

export async function generateAgentSkeleton(
  description: string,
  apiKey: string
): Promise<GeneratedSkeleton> {
  const fallback = ruleBasedSkeleton(description);
  if (!apiKey) {
    if (fallback) return fallback;
    throw new Error("Clé OpenAI requise pour générer un squelette — ou décrivez un cas email/LinkedIn/réunion/support.");
  }

  const system = `Tu es un architecte d'agents IA pour Prompta. Génère UNIQUEMENT du JSON valide (pas de markdown).
Règles :
- 2 à 4 étapes LLM maximum
- Variables d'entrée en snake_case dans {{variable}}
- Références d'étapes : {{step_0_output}}, {{step_1_output}}…
- Modèles autorisés : gpt-5.4, gpt-5-mini, claude-sonnet-4-6, claude-haiku-4-5, gemini-3-flash
- requiredSecrets parmi : openai, anthropic, google, mistral, serper
- Prompts en français si la description est en français`;

  const user = `Description de l'agent souhaité :
"${description}"

Réponds avec ce JSON exact :
{
  "title": "...",
  "description": "...",
  "type": "agent" | "workflow",
  "models": ["gpt-5.4"],
  "tags": ["..."],
  "integrations": [],
  "requiredSecrets": ["openai"],
  "envFields": [{ "key": "...", "label": "...", "required": true, "type": "textarea", "help": "..." }],
  "steps": [{ "type": "llm", "model": "gpt-5.4", "prompt": "..." }]
}`;

  try {
    const result = await callModel({
      provider: "openai",
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      apiKey,
      maxTokens: 2000,
      tokenParam: "max_tokens",
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON absent");
    const parsed = GeneratedSkeletonSchema.parse(JSON.parse(jsonMatch[0]));

    parsed.requiredSecrets = (parsed.requiredSecrets ?? ["openai"]).filter((s): s is KeyProvider =>
      VALID_SECRETS.has(s as KeyProvider)
    );
    if (parsed.requiredSecrets.length === 0) parsed.requiredSecrets = ["openai"];

    return parsed;
  } catch {
    if (fallback) return fallback;
    throw new Error("Impossible de générer le squelette — réessayez ou choisissez un template.");
  }
}

export function listTemplateKeywords(): string {
  return AGENT_TEMPLATES.map((t) => t.id).join(", ");
}
