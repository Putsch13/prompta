import type { AgentInput, AgentStep } from "@/lib/agent/schema";
import type { EnvFieldInput } from "@/lib/builder/manifest";
import { extractInputVariables, isFakeVariable, keyToLabel } from "@/lib/builder/variables";
import { graphToSteps, type PlanGraph } from "@/lib/builder/plan-graph";
import { isParamBinding, isResourcePlaceholder } from "@/lib/connectors/param-bindings";
import { getConnectorAction } from "@/lib/connectors/registry";
import { inputHasRuntimeDefault } from "@/lib/connectors/param-defaults";
import type { ActionInput } from "@/lib/connectors/types";
import { askedInputs, buildContract } from "@/lib/agent/contract";

const BINDING_KEY_RE = /^\s*\{\{([\w.]+)\}\}\s*$/;

export function bindingKey(value?: string): string | null {
  if (!value) return null;
  const m = value.trim().match(BINDING_KEY_RE);
  if (!m) return null;
  if (m[1].startsWith("resource:")) return null;
  return m[1];
}

/** Clé de binding par défaut pour un paramètre action non-ressource. */
export function defaultParamBindingKey(connectorId: string, paramKey: string): string {
  return `${connectorId}_${paramKey}`;
}

function registryFieldType(input?: ActionInput): EnvFieldInput["type"] {
  if (input?.type === "textarea") return "textarea";
  if (input?.type === "email") return "text";
  return "text";
}

function registryHelp(input?: ActionInput): string | undefined {
  return input?.help?.trim() || undefined;
}

/** Collecte les outputKey produits par le graphe / les étapes. */
export function collectStepOutputKeys(steps: AgentStep[], graph?: PlanGraph | null): Set<string> {
  const keys = new Set<string>();
  if (graph) {
    for (const node of graph.nodes) {
      if (node.outputKey) keys.add(node.outputKey);
    }
  }

  function walk(list: AgentStep[]) {
    for (const step of list) {
      if (step.type === "parallel") {
        for (const branch of step.branches) {
          if (branch.outputKey) keys.add(branch.outputKey);
          walk(branch.steps as AgentStep[]);
        }
        continue;
      }
      const base = step as { outputKey?: string };
      if (base.outputKey) keys.add(base.outputKey);
    }
  }

  walk(steps);
  return keys;
}

function shouldSkipBindingKey(key: string, outputKeys: Set<string>): boolean {
  if (outputKeys.has(key)) return true;
  if (isFakeVariable(key)) return true;
  if (key.includes("_output")) return true;
  return false;
}

function isPinnedLiteral(
  value: string | undefined,
  paramMeta?: { scope?: string; shared?: boolean },
): boolean {
  if (!value?.trim()) return false;
  if (isParamBinding(value) || isResourcePlaceholder(value)) return false;
  if (paramMeta?.shared) return true;
  if (paramMeta?.scope === "builder_test") return true;
  return false;
}

export interface DerivedRunInput extends EnvFieldInput {
  connectorId?: string;
  paramKey?: string;
  resourceType?: string;
}

/** Dérive les champs texte demandés au run depuis les étapes réelles. */
export function deriveRunInputsFromSteps(
  steps: AgentStep[],
  graph?: PlanGraph | null,
): DerivedRunInput[] {
  const outputKeys = collectStepOutputKeys(steps, graph);
  const fields = new Map<string, DerivedRunInput>();

  function addField(
    key: string,
    partial: Omit<DerivedRunInput, "key"> & { key?: string },
  ) {
    if (shouldSkipBindingKey(key, outputKeys)) return;
    const existing = fields.get(key);
    fields.set(key, {
      key,
      label: partial.label || existing?.label || keyToLabel(key),
      required: partial.required ?? existing?.required ?? true,
      type: partial.type ?? existing?.type ?? "text",
      help: partial.help ?? existing?.help,
      connectorId: partial.connectorId ?? existing?.connectorId,
      paramKey: partial.paramKey ?? existing?.paramKey,
      resourceType: partial.resourceType ?? existing?.resourceType,
    });
  }

  function walk(list: AgentStep[]) {
    for (const step of list) {
      if (step.type === "parallel") {
        for (const branch of step.branches) {
          walk(branch.steps as AgentStep[]);
        }
        continue;
      }

      if (step.type === "llm") {
        for (const key of extractInputVariables(step.prompt)) {
          addField(key, { label: keyToLabel(key), required: true, type: "text" });
        }
        continue;
      }

      if (step.type === "retrieve") {
        for (const key of extractInputVariables(step.query)) {
          addField(key, { label: keyToLabel(key), required: true, type: "text" });
        }
        continue;
      }

      if (step.type === "condition") {
        for (const key of extractInputVariables(step.expression)) {
          addField(key, { label: keyToLabel(key), required: true, type: "text" });
        }
        continue;
      }

      if (step.type !== "action") continue;
      if (step.sharedEnv) continue;

      const actionDef = getConnectorAction(step.connector, step.action);
      for (const [paramKey, rawValue] of Object.entries(step.params ?? {})) {
        const meta = step.paramMeta?.[paramKey];
        const inputDef = actionDef?.inputs.find((i) => i.key === paramKey);

        if (isResourcePlaceholder(rawValue)) continue;
        if (isPinnedLiteral(rawValue, meta)) continue;

        const bound = bindingKey(rawValue);
        if (bound) {
          if (inputDef && inputHasRuntimeDefault(inputDef)) {
            if (meta?.scope !== "end_user") continue;
            addField(bound, {
              label: inputDef?.label ?? keyToLabel(bound),
              required: false,
              type: registryFieldType(inputDef),
              help: registryHelp(inputDef),
              connectorId: step.connector,
              paramKey,
            });
            continue;
          }
          addField(bound, {
            label: inputDef?.label ?? keyToLabel(bound),
            required: inputDef?.required ?? true,
            type: registryFieldType(inputDef),
            help: registryHelp(inputDef),
            connectorId: step.connector,
            paramKey,
          });
          continue;
        }

        if (!rawValue?.trim() && inputDef?.required) {
          const fallbackKey = defaultParamBindingKey(step.connector, paramKey);
          addField(fallbackKey, {
            label: inputDef.label,
            required: true,
            type: registryFieldType(inputDef),
            help: registryHelp(inputDef),
            connectorId: step.connector,
            paramKey,
          });
        }
      }
    }
  }

  walk(steps);
  return Array.from(fields.values());
}

export function deriveManifestInputsFromSteps(
  steps: AgentStep[],
  graph?: PlanGraph | null,
): AgentInput[] {
  return deriveRunInputsFromSteps(steps, graph).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type ?? "text",
    required: f.required,
    help: f.help,
  }));
}

/** Mappe le type de variable déclarée (plan) vers un type de champ env. */
function declaredVarType(t?: string): EnvFieldInput["type"] {
  if (t === "number") return "number";
  if (t === "file") return "file";
  if (t === "textarea") return "textarea";
  return "text"; // text | url | email | json | boolean → champ texte
}

/**
 * Champs run dérivés du graphe builder (source unique pour envFields).
 *
 * On combine DEUX sources :
 *  1. les placeholders effectivement utilisés par les steps (contrat) ;
 *  2. les variables DÉCLARÉES dans le plan (graph.meta.variables) — même si un
 *     step ne les référence pas encore. Sans (2), un plan qui déclare « quoi
 *     analyser / destinataire / ton » mais oublie de câbler le placeholder ne
 *     demandait RIEN à l'utilisateur → l'agent partait avec des champs vides.
 */
export function graphRunInputs(graph: PlanGraph, defaultModel = "gpt-5.4"): EnvFieldInput[] {
  const steps = graphToSteps(graph, defaultModel);
  const asked = askedInputs(buildContract(steps));
  const fields: EnvFieldInput[] = asked.map((needed) => ({
    key: needed.key,
    label: needed.label,
    required: needed.required,
    type: needed.kind === "textarea" ? "textarea" : needed.kind === "number" ? "number" : "text",
    help: needed.help,
    connectorId: needed.connectorParam?.connector,
    paramKey: needed.connectorParam?.key,
  }));

  const seen = new Set(fields.map((f) => f.key));
  for (const v of graph.meta?.variables ?? []) {
    if (!v?.key || seen.has(v.key) || isFakeVariable(v.key)) continue;
    seen.add(v.key);
    fields.push({
      key: v.key,
      label: v.label || keyToLabel(v.key),
      required: v.required !== false,
      type: declaredVarType(v.type),
      help: v.help,
    });
  }

  return fields;
}
