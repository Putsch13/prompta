import type { AgentManifest, AgentStep, AgentKind, ExecutionMode } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";
import { connectorsForSteps } from "@/lib/connectors/registry";
import { dedupeConnectors } from "@/lib/connectors/resolve-id";
import { enrichEnvField } from "@/lib/builder/env-field-hints";
import { askedInputs, buildContract, type NeededInput } from "@/lib/agent/contract";
import { managedDeliverables } from "@/lib/builder/provisioning";

export interface EnvFieldInput {
  key: string;
  label: string;
  required: boolean;
  type?: "text" | "textarea" | "number" | "file" | "list";
  help?: string;
  connectorId?: string;
  paramKey?: string;
  resourceType?: string;
}

export interface BuildManifestParams {
  type: "prompt" | "agent" | "workflow";
  kind?: AgentKind;
  executionMode?: ExecutionMode;
  promptBody: string;
  steps: AgentStep[];
  envFields?: EnvFieldInput[];
  requiredSecrets: KeyProvider[];
  requiredConnectors?: string[];
  defaultModel?: string;
  provisioningMode?: "manual" | "assisted" | "managed";
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

  const inferredKind = params.kind ?? params.type;
  const inferredMode: ExecutionMode | undefined = params.executionMode ??
    (inferredKind === "prompt" ? "deterministic"
      : inferredKind === "workflow" ? "deterministic"
      : "semi_autonomous");

  const provisioningMode = params.provisioningMode ?? "manual";

  const contract = buildContract(steps);
  const asked = askedInputs(contract);

  return {
    kind: inferredKind,
    executionMode: inferredMode,
    inputs: asked.map((needed) => toManifestInput(needed)),
    secrets: [...params.requiredSecrets],
    connectors: dedupeConnectors([
      ...connectorsForSteps(steps),
      ...(params.requiredConnectors ?? []),
    ]),
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
    provisioning:
      params.type === "prompt"
        ? undefined
        : {
            mode: provisioningMode,
            autoCreateResources: provisioningMode !== "manual",
            deliverables:
              provisioningMode === "managed"
                ? managedDeliverables({ steps, inputs: [], secrets: [], connectors: [], tools: [], limits: {} as AgentManifest["limits"], outputs: [] })
                : [],
          },
  };
}

function kindToEnvType(kind: NeededInput["kind"]): NonNullable<EnvFieldInput["type"]> {
  if (kind === "textarea") return "textarea";
  if (kind === "number") return "number";
  return "text";
}

function toManifestInput(needed: NeededInput) {
  const baseField: EnvFieldInput = {
    key: needed.key,
    label: needed.label,
    required: needed.required,
    type: kindToEnvType(needed.kind),
    help: needed.help,
    connectorId: needed.connectorParam?.connector,
    paramKey: needed.connectorParam?.key,
  };
  const enriched = enrichEnvField(baseField);
  return {
    key: baseField.key,
    label: enriched.label || baseField.label,
    type: enriched.type ?? baseField.type ?? ("text" as const),
    required: baseField.required,
    help: enriched.help?.trim() ? enriched.help : baseField.help,
    connectorId: baseField.connectorId,
    paramKey: baseField.paramKey,
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
