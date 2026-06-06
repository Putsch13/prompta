import { AgentManifestSchema, type AgentManifest } from "./schema";

export interface ListingEnvMeta {
  dependencies?: string | null;
  setup_time?: string | null;
}

export interface ListingEnv {
  manifest: AgentManifest;
  meta?: ListingEnvMeta;
}

/** Extrait le manifeste depuis env (nouveau format, legacy ou manifeste racine). */
export function parseListingEnv(
  env: unknown,
  promptBody?: string | null
): ListingEnv | null {
  if (!env || typeof env !== "object") {
    if (promptBody) {
      return { manifest: promptFromBody(promptBody) };
    }
    return null;
  }

  const raw = env as Record<string, unknown>;

  if (raw.manifest) {
    const parsed = AgentManifestSchema.safeParse(raw.manifest);
    if (parsed.success) {
      return {
        manifest: parsed.data,
        meta: (raw.meta as ListingEnvMeta) ?? undefined,
      };
    }
  }

  if (Array.isArray(raw.steps)) {
    const parsed = AgentManifestSchema.safeParse(raw);
    if (parsed.success) {
      return { manifest: parsed.data };
    }
  }

  const fields = raw.fields as { key: string; description?: string; required?: boolean }[] | undefined;
  if (fields && promptBody) {
    return {
      manifest: {
        inputs: fields.map((f) => ({
          key: f.key,
          label: f.description ?? f.key,
          type: "text" as const,
          required: f.required ?? false,
        })),
        secrets: [],
        connectors: [],
        tools: [],
        steps: [
          {
            type: "llm" as const,
            model: "gpt-5.4",
            prompt: promptBody,
          },
        ],
        limits: { max_steps: 10, max_tokens: 8000, timeout_ms: 60000, max_tool_calls: 5, max_output_bytes: 51200 },
        outputs: ["result"],
      },
      meta: {
        dependencies: (raw.dependencies as string) ?? null,
        setup_time: (raw.setup_time as string) ?? null,
      },
    };
  }

  if (promptBody) {
    return { manifest: promptFromBody(promptBody) };
  }

  return null;
}

export function promptFromBody(promptBody: string, model = "gpt-5.4"): AgentManifest {
  const vars = Array.from(
    new Set((promptBody.match(/\{\{(\w+)\}\}/g) ?? []).map((m) => m.replace(/\{\{|\}\}/g, "")))
  );
  return {
    inputs: vars.map((key) => ({
      key,
      label: key,
      type: "text" as const,
      required: true,
    })),
    secrets: [],
    connectors: [],
    tools: [],
    steps: [{ type: "llm", model, prompt: promptBody }],
    limits: { max_steps: 10, max_tokens: 8000, timeout_ms: 60000, max_tool_calls: 5, max_output_bytes: 51200 },
    outputs: ["result"],
  };
}

export function envFieldsFromManifest(manifest: AgentManifest) {
  return manifest.inputs.map((i) => ({
    key: i.key,
    label: i.label,
    description: i.label,
    help: i.help,
    type: i.type,
    required: i.required,
    connectorId: i.connectorId,
    paramKey: i.paramKey,
  }));
}
