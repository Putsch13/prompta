import type { AgentManifest, AgentStep, AgentKind, ExecutionMode } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";
import { connectorsForSteps } from "@/lib/connectors/registry";
import { dedupeConnectors } from "@/lib/connectors/resolve-id";
import { enrichEnvField } from "@/lib/builder/env-field-hints";
import { askedInputs, buildContract, type NeededInput } from "@/lib/agent/contract";
import { collectUndeclaredVariables } from "@/lib/builder/validate-agent";
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

/**
 * Limites dimensionnées sur le contenu réel de l'agent.
 * Les anciens plafonds fixes (5 tool calls, 60 s, 8 000 tokens cumulés, 50 Ko)
 * faisaient échouer des agents pourtant valides construits dans le builder
 * (jusqu'à 40 nœuds) : « Plafond atteint » au run alors que le build passait.
 * Le coût, lui, est gardé par le hold de crédits (estimate-manifest-cost
 * plafonne à 4 096 tokens de sortie par étape LLM, indépendamment d'ici).
 */
export function computeManifestLimits(steps: AgentStep[]): AgentManifest["limits"] {
  const flat = steps.flatMap((s) =>
    s.type === "parallel" ? s.branches.flatMap((b) => b.steps) : [s],
  );
  const llmCount = flat.filter((s) => s.type === "llm").length;
  const toolActionCount = flat.filter(
    (s) => s.type === "tool" || s.type === "action",
  ).length;

  return {
    max_steps: Math.max(steps.length + 2, 10),
    // Cumul entrée+sortie sur tout le run : les prompts embarquent les sorties
    // des étapes amont (Sheets, docs…), 8 000 cumulés était intenable.
    max_tokens: Math.max(16_000, llmCount * 8_000),
    // ~45 s par étape (LLM lents + retries connecteur 1+3+9 s), borné à 5 min
    // (aligné sur maxDuration=300 de la route sync ; le worker n'a pas de borne HTTP).
    timeout_ms: Math.min(Math.max(120_000, flat.length * 45_000), 300_000),
    // Chaque étape tool/action compte 1 appel + marge retries/reprises.
    max_tool_calls: Math.max(10, toolActionCount * 2),
    max_output_bytes: 512_000,
  };
}

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

  // Auto-déclaration : toute variable {{x}} utilisée dans un prompt/param mais
  // ni produite par une étape ni déjà déclarée devient une entrée demandée au
  // lancement — au lieu de bloquer la publication (« variable non déclarée »).
  const declaredKeys = asked.map((n) => n.key);
  const autoInputs = collectUndeclaredVariables(steps, declaredKeys).map((key) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    type: "text" as const,
    // OPTIONNELLES : le masque de test du wizard ne connaît pas ces champs
    // (dérivés au buildManifest) — required:true bloquait le lancement en
    // « configuration incomplète » sans aucun champ à remplir à l'écran.
    required: false,
    help: undefined as string | undefined,
    connectorId: undefined as string | undefined,
    paramKey: undefined as string | undefined,
  }));

  return {
    kind: inferredKind,
    executionMode: inferredMode,
    inputs: [...asked.map((needed) => toManifestInput(needed)), ...autoInputs],
    secrets: [...params.requiredSecrets],
    connectors: dedupeConnectors([
      ...connectorsForSteps(steps),
      ...(params.requiredConnectors ?? []),
    ]),
    tools: Array.from(toolsUsed),
    steps,
    limits: computeManifestLimits(steps),
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
