import { z } from "zod";

// ─── Inputs ──────────────────────────────────────────────────────────────────
export const AgentInputSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "number", "file", "list"]).default("text"),
  required: z.boolean().default(false),
  help: z.string().optional(),
  connectorId: z.string().optional(),
  paramKey: z.string().optional(),
});

// ─── Steps ───────────────────────────────────────────────────────────────────

/** Steps de base (non-parallel) pour éviter la récursion infinie. */
export const BaseAgentStepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("llm"),
    model: z.string(),
    prompt: z.string(),
    outputKey: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool"),
    tool: z.enum(["web_search", "http_fetch", "file_read"]),
    params: z.record(z.string(), z.string()).default({}),
    outputKey: z.string().optional(),
  }),
  z.object({
    type: z.literal("action"),
    connector: z.string(),
    action: z.string(),
    params: z.record(z.string(), z.string()).default({}),
    paramMeta: z
      .record(
        z.string(),
        z.object({
          scope: z.enum(["builder_test", "end_user", "dynamic"]),
          resourceType: z.string().optional(),
          shared: z.boolean().optional(),
        }),
      )
      .optional(),
    /**
     * Snapshot du schéma d'entrées d'un outil Composio arbitraire (hors registre
     * natif). Permet au contrat/résolveur/inspecteur de fonctionner pour
     * n'importe lequel des 300+ connecteurs sans entrée codée en dur.
     */
    inputsSchema: z
      .array(
        z.object({
          key: z.string(),
          label: z.string(),
          type: z.enum(["text", "textarea", "email"]).optional(),
          required: z.boolean().optional(),
          kind: z.enum(["static", "input", "step_ref", "resource", "identity"]),
          resourceType: z.string().optional(),
          defaultScope: z.enum(["builder_test", "end_user", "dynamic"]).optional(),
          dependsOn: z.string().optional(),
          help: z.string().optional(),
          placeholder: z.string().optional(),
          defaultValue: z.string().optional(),
        }),
      )
      .optional(),
    /**
     * Remplissage par IA des paramètres en champ libre : pour chaque clé, un
     * modèle au choix génère la valeur à partir d'une consigne (le prompt peut
     * référencer {{variables}} et sorties d'étapes). Ces paramètres ne sont PAS
     * demandés à l'abonné (cf. contract.ts).
     */
    aiFills: z
      .record(
        z.string(),
        z.object({
          model: z.string(),
          prompt: z.string(),
        }),
      )
      .optional(),
    /** Env partagée : accès/ressources du builder pour tous les abonnés */
    sharedEnv: z.boolean().optional(),
    outputKey: z.string().optional(),
  }),
  z.object({
    type: z.literal("code"),
    language: z.enum(["python"]).default("python"),
    source: z.string(),
    outputKey: z.string().optional(),
  }),
  z.object({
    type: z.literal("condition"),
    expression: z.string(),
    outputKey: z.string().optional(),
    ifTrueStepIds: z.array(z.string()).optional(),
    ifFalseStepIds: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("approval"),
    label: z.string().optional(),
    payloadTemplate: z.string().optional(),
    outputKey: z.string().optional(),
    expiresInMinutes: z.number().default(60),
  }),
  z.object({
    type: z.literal("retrieve"),
    source: z.enum(["file_upload", "google_drive", "notion", "google_sheets", "url", "gmail", "hubspot", "custom_api"]),
    query: z.string(),
    outputKey: z.string().optional(),
    maxResults: z.number().default(5),
  }),
]);

export type BaseAgentStep = z.infer<typeof BaseAgentStepSchema>;

export const ParallelBranchSchema = z.object({
  steps: z.array(BaseAgentStepSchema).min(1),
  outputKey: z.string().optional(),
});

export const ParallelStepSchema = z.object({
  type: z.literal("parallel"),
  branches: z.array(ParallelBranchSchema),
  outputKey: z.string().optional(),
});

export type ParallelStep = z.infer<typeof ParallelStepSchema>;
export type ParallelBranch = z.infer<typeof ParallelBranchSchema>;

/** Union complète incluant les étapes parallèles. */
export const AgentStepSchema = z.union([BaseAgentStepSchema, ParallelStepSchema]);

// ─── Kind / execution mode (Ticket 10) ──────────────────────────────────────
export const AgentKindSchema = z.enum(["prompt", "workflow", "agent"]);
export const ExecutionModeSchema = z.enum(["deterministic", "semi_autonomous", "autonomous"]);

// ─── Manifest ────────────────────────────────────────────────────────────────
export const AgentManifestSchema = z.object({
  kind: AgentKindSchema.optional(),
  executionMode: ExecutionModeSchema.optional(),
  inputs: z.array(AgentInputSchema).default([]),
  secrets: z.array(z.string()).default([]),
  connectors: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  steps: z.array(AgentStepSchema).default([]),
  limits: z
    .object({
      max_steps: z.number().default(10),
      max_tokens: z.number().default(8000),
      timeout_ms: z.number().default(60000),
      max_tool_calls: z.number().default(5),
      max_output_bytes: z.number().default(51200),
    })
    .default({ max_steps: 10, max_tokens: 8000, timeout_ms: 60000, max_tool_calls: 5, max_output_bytes: 51200 }),
  outputs: z.array(z.string()).default(["result"]),
  provisioning: z
    .object({
      mode: z.enum(["manual", "assisted", "managed"]).default("manual"),
      autoCreateResources: z.boolean().default(false),
      deliverables: z.array(z.string()).default([]),
    })
    .optional(),
  memory: z
    .object({
      enabled: z.boolean().default(false),
      maxMemories: z.number().default(10),
    })
    .optional(),
});

export type AgentKind = z.infer<typeof AgentKindSchema>;
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AgentManifest = z.infer<typeof AgentManifestSchema>;
export type AgentStep = z.infer<typeof AgentStepSchema>;
