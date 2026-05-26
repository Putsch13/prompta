import type { AgentManifest, AgentStep } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";
import { SIGNATURE_EMAIL_AGENT } from "./signature-email-agent";

export interface AgentTemplateEnvField {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "textarea" | "number" | "file" | "list";
  help?: string;
}

export interface AgentTemplate {
  id: string;
  label: string;
  description: string;
  segment: string;
  type: "agent" | "workflow";
  models: string[];
  tags: string[];
  integrations: string[];
  requiredSecrets: KeyProvider[];
  requiredConnectors: string[];
  envFields: AgentTemplateEnvField[];
  steps: AgentStep[];
  setupTime: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "email-pro",
    label: "Assistant Email Pro",
    description: SIGNATURE_EMAIL_AGENT.description,
    segment: "Freelances & PME",
    type: "agent",
    models: SIGNATURE_EMAIL_AGENT.models,
    tags: SIGNATURE_EMAIL_AGENT.tags,
    integrations: [],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    envFields: SIGNATURE_EMAIL_AGENT.manifest.inputs.map((i) => ({
      key: i.key,
      label: i.label,
      required: i.required,
      type: i.type as AgentTemplateEnvField["type"],
      help: i.help,
    })),
    steps: SIGNATURE_EMAIL_AGENT.manifest.steps,
    setupTime: "2 min",
  },
  {
    id: "linkedin-post",
    label: "Post LinkedIn depuis une idée",
    segment: "Builders & créateurs",
    type: "agent",
    description: "Transforme une idée brute en post LinkedIn structuré avec hook, corps et CTA.",
    models: ["gpt-5.4", "claude-sonnet-4-6"],
    tags: ["linkedin", "content", "social"],
    integrations: [],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    setupTime: "2 min",
    envFields: [
      { key: "idee", label: "Idée / sujet", required: true, type: "textarea", help: "De quoi voulez-vous parler ?" },
      { key: "ton", label: "Ton", required: false, type: "text", help: "Ex. expert, décontracté, provocateur" },
      { key: "public", label: "Public cible", required: false, type: "text", help: "Ex. fondateurs SaaS, RH…" },
    ],
    steps: [
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: `Analyse cette idée de post LinkedIn et propose un angle fort (hook + structure).

Idée : {{idee}}
Public : {{public}}
Ton : {{ton}}`,
      },
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: `Rédige le post LinkedIn final à partir de cette analyse :
{{step_0_output}}

Contraintes : 1200 caractères max, sauts de ligne aérés, 1 emoji max, CTA clair en fin de post.`,
      },
    ],
  },
  {
    id: "meeting-summary",
    label: "Compte-rendu de réunion",
    segment: "Équipes & consultants",
    type: "workflow",
    description: "Notes brutes → synthèse + décisions + actions avec responsables.",
    models: ["gpt-5.4"],
    tags: ["productivité", "réunion", "b2b"],
    integrations: [],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    setupTime: "3 min",
    envFields: [
      { key: "notes", label: "Notes de réunion", required: true, type: "textarea" },
      { key: "participants", label: "Participants", required: false, type: "text" },
    ],
    steps: [
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: `Extrais de ces notes de réunion : contexte, décisions prises, points bloquants.

Participants : {{participants}}
Notes :
{{notes}}`,
      },
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: `Produis un compte-rendu professionnel à partir de :
{{step_0_output}}

Format : Résumé (3 lignes) · Décisions · Actions (qui / quoi / quand) · Prochaine étape`,
      },
    ],
  },
  {
    id: "support-reply",
    label: "Réponse support client",
    segment: "SaaS & e-commerce",
    type: "agent",
    description: "Ticket client → réponse empathique + solution étape par étape.",
    models: ["gpt-5.4", "claude-haiku-4-5"],
    tags: ["support", "saas", "client"],
    integrations: [],
    requiredSecrets: ["openai"],
    requiredConnectors: [],
    setupTime: "2 min",
    envFields: [
      { key: "ticket", label: "Message client", required: true, type: "textarea" },
      { key: "politique", label: "Politique / contraintes", required: false, type: "text", help: "Ex. pas de remboursement au-delà de 14j" },
    ],
    steps: [
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: `Analyse ce ticket support : intention, urgence, sentiment, infos manquantes.

Ticket :
{{ticket}}`,
      },
      {
        type: "llm",
        model: "gpt-5.4",
        prompt: `Rédige une réponse support client à partir de :
{{step_0_output}}

Politique à respecter : {{politique}}
Ton : empathique, clair, orienté solution. Propose des étapes numérotées si pertinent.`,
      },
    ],
  },
];

export function getAgentTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((t) => t.id === id);
}

export function templateToManifest(template: AgentTemplate): AgentManifest {
  return {
    inputs: template.envFields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      help: f.help,
    })),
    secrets: [...template.requiredSecrets],
    connectors: [...template.requiredConnectors],
    tools: [],
    steps: template.steps,
    limits: {
      max_steps: Math.max(template.steps.length + 2, 10),
      max_tokens: 8000,
      timeout_ms: 90000,
      max_tool_calls: 5,
      max_output_bytes: 51200,
    },
    outputs: ["result"],
  };
}
