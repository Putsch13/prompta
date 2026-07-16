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
    tool: z.enum(["web_search", "http_fetch", "web_fetch", "file_read"]),
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
    // Optionnel : le défaut (24 h) vit dans createPendingApproval — un default
    // Zod ici l'écraserait systématiquement (bug du « défaut 24 h mort »).
    expiresInMinutes: z.number().optional(),
  }),
  z.object({
    type: z.literal("retrieve"),
    source: z.enum(["file_upload", "google_drive", "notion", "google_sheets", "url", "gmail", "hubspot", "custom_api"]),
    query: z.string(),
    outputKey: z.string().optional(),
    maxResults: z.number().default(5),
  }),
  /**
   * Pilotage du navigateur (Prompta partout) : l'agent AGIT dans l'onglet de
   * l'utilisateur — clics, saisie, navigation — en mode copilote visible.
   * Boucle serveur : le LLM décide une action à la fois, l'extension l'exécute
   * dans la page (avec la session de l'utilisateur) et renvoie un snapshot.
   * Les actions à risque exigent une confirmation IN-PAGE de l'utilisateur.
   */
  z.object({
    type: z.literal("browser"),
    /** Objectif de la séquence de pilotage, en langage naturel. */
    goal: z.string(),
    /** Modèle qui décide les actions (défaut : modèle de la mission). */
    model: z.string().optional(),
    maxActions: z.number().optional(),
    outputKey: z.string().optional(),
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
  // Défauts alignés sur computeManifestLimits (lib/builder/manifest.ts) et le
  // plancher runtime de l'orchestrateur — les anciens défauts (60 s, 5 calls,
  // 8 000 tokens, 50 Ko) faisaient échouer des agents valides.
  limits: z
    .object({
      max_steps: z.number().default(20),
      max_tokens: z.number().default(16000),
      timeout_ms: z.number().default(180000),
      max_tool_calls: z.number().default(10),
      max_output_bytes: z.number().default(512000),
    })
    .default({ max_steps: 20, max_tokens: 16000, timeout_ms: 180000, max_tool_calls: 10, max_output_bytes: 512000 }),
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
