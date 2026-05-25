import type { AgentManifest, AgentStep } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";

export interface EnvFieldInput {
  key: string;
  label: string;
  required: boolean;
}

export interface BuildManifestParams {
  type: "prompt" | "agent" | "workflow";
  promptBody: string;
  steps: AgentStep[];
  envFields: EnvFieldInput[];
  requiredSecrets: KeyProvider[];
  defaultModel?: string;
}

const LONG_TOOLS = new Set(["http_fetch", "file_read"]);

export function buildManifest(params: BuildManifestParams): AgentManifest {
  const model = params.defaultModel ?? "gpt-4o";
  const toolsUsed = new Set<string>();

  let steps: AgentStep[];
  if (params.type === "prompt") {
    steps = [{ type: "llm", model, prompt: params.promptBody }];
  } else {
    steps = params.steps.length > 0 ? params.steps : [{ type: "llm", model, prompt: params.promptBody }];
    for (const step of steps) {
      if (step.type === "tool") toolsUsed.add(step.tool);
    }
  }

  return {
    inputs: params.envFields.map((f) => ({
      key: f.key,
      label: f.label,
      type: "text" as const,
      required: f.required,
    })),
    secrets: [...params.requiredSecrets],
    tools: Array.from(toolsUsed),
    steps,
    limits: {
      max_steps: Math.max(steps.length + 2, 10),
      max_tokens: 8000,
      timeout_ms: steps.some((s) => s.type === "tool" && LONG_TOOLS.has(s.tool)) ? 120000 : 60000,
    },
    outputs: ["result"],
  };
}

/** Sync si court et sans outil long (Bloc 3). */
export function shouldRunSync(manifest: AgentManifest): boolean {
  if (manifest.steps.length > 3) return false;
  return !manifest.steps.some(
    (s) => s.type === "tool" && LONG_TOOLS.has(s.tool)
  );
}
