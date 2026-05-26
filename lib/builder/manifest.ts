import type { AgentManifest, AgentStep } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";
import { connectorsForSteps } from "@/lib/connectors/registry";

export interface EnvFieldInput {
  key: string;
  label: string;
  required: boolean;
  type?: "text" | "textarea" | "number" | "file" | "list";
  help?: string;
}

export interface BuildManifestParams {
  type: "prompt" | "agent" | "workflow";
  promptBody: string;
  steps: AgentStep[];
  envFields: EnvFieldInput[];
  requiredSecrets: KeyProvider[];
  requiredConnectors?: string[];
  defaultModel?: string;
}

const LONG_TOOLS = new Set(["http_fetch", "file_read"]);

export function buildManifest(params: BuildManifestParams): AgentManifest {
  const model = params.defaultModel ?? "gpt-5.4";
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
    inputs: params.envFields
      .filter((f) => f.key.trim())
      .map((f) => ({
        key: f.key,
        label: f.label || f.key,
        type: f.type ?? ("text" as const),
        required: f.required,
        help: f.help,
      })),
    secrets: [...params.requiredSecrets],
    connectors: Array.from(
      new Set([...connectorsForSteps(steps), ...(params.requiredConnectors ?? [])])
    ),
    tools: Array.from(toolsUsed),
    steps,
    limits: {
      max_steps: Math.max(steps.length + 2, 10),
      max_tokens: 8000,
      timeout_ms: steps.some((s) => s.type === "tool" && LONG_TOOLS.has(s.tool)) ? 120000 : 60000,
      max_tool_calls: 5,
      max_output_bytes: 51200,
    },
    outputs: ["result"],
  };
}

/** Sync si court et sans outil long, connecteur ou code. */
export function shouldRunSync(manifest: AgentManifest): boolean {
  if (manifest.steps.length > 3) return false;
  return !manifest.steps.some((s) => {
    if (s.type === "action" || s.type === "code") return true;
    if (s.type === "tool") {
      if (LONG_TOOLS.has(s.tool)) return true;
      if (s.tool === "web_search") return true;
    }
    return false;
  });
}
