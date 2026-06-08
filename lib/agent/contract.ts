/**
 * Contrat d'agent — source unique de vérité pour « ce dont un agent a besoin ».
 *
 * Dérive l'interface (champs/ressources/identités demandés au run) directement
 * depuis les étapes (`AgentStep[]`). Tout ce qui est résolu localement
 * (littéral épinglé, sortie d'étape) n'apparaît pas dans l'interface.
 *
 * Référencé par REFONTE-prompta-runtime.md (Pilier A).
 */

import type { AgentStep } from "@/lib/agent/schema";
import {
  isParamBinding,
  isResourcePlaceholder,
  type ParamMeta,
  type ParamScope,
} from "@/lib/connectors/param-bindings";
import { actionInputsForStep } from "@/lib/connectors/action-inputs";
import type { ActionInput } from "@/lib/connectors/types";
import { inputHasRuntimeDefault } from "@/lib/connectors/param-defaults";
import {
  extractInputVariables,
  isFakeVariable,
  keyToLabel,
} from "@/lib/builder/variables";
import { stepKey, walkWithIndex } from "@/lib/agent/step-key";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NeededInputSource = "step" | "pinned" | "subscriber" | "shared";
export type NeededInputKind =
  | "text"
  | "email"
  | "textarea"
  | "number"
  | "resource"
  | "identity"
  | "secret"
  | "connection";

export interface NeededInput {
  /** Clé de binding (== identifiant unique côté UI/orchestrateur). */
  key: string;
  source: NeededInputSource;
  kind: NeededInputKind;
  resourceType?: string;
  connectorParam?: { connector: string; key: string; stepIndex: number };
  label: string;
  help?: string;
  placeholder?: string;
  /** Présent uniquement pour `pinned`/`shared`. */
  value?: string;
  required: boolean;
}

export interface AgentContract {
  steps: AgentStep[];
  interface: NeededInput[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BINDING_KEY_RE = /^\s*\{\{([\w.]+)\}\}\s*$/;

function bindingKeyOf(value?: string): string | null {
  if (!value) return null;
  const m = value.trim().match(BINDING_KEY_RE);
  if (!m) return null;
  if (m[1].startsWith("resource:")) return null;
  return m[1];
}

function collectOutputKeys(steps: AgentStep[]): Set<string> {
  const keys = new Set<string>();
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

function isStepOutputKey(key: string, outputKeys: Set<string>): boolean {
  if (outputKeys.has(key)) return true;
  // Variables imbriquées : {{report.section}} où `report` est un outputKey
  const root = key.split(".")[0];
  if (root && outputKeys.has(root)) return true;
  return false;
}

function kindFromInputDef(input: ActionInput | undefined): NeededInputKind {
  if (!input) return "text";
  if (input.kind === "resource") return "resource";
  if (input.kind === "identity") return "identity";
  if (input.type === "textarea") return "textarea";
  if (input.type === "email") return "email";
  return "text";
}

function sourceFromMeta(meta?: ParamMeta): NeededInputSource {
  if (meta?.shared) return "shared";
  if (meta?.scope === "builder_test") return "pinned";
  return "subscriber";
}

function isLiteralValue(value: string | undefined, meta?: ParamMeta): boolean {
  if (!value?.trim()) return false;
  if (isParamBinding(value) || isResourcePlaceholder(value)) return false;
  if (meta?.shared) return true;
  if (meta?.scope === "builder_test") return true;
  return false;
}

// ─── Dérivation ──────────────────────────────────────────────────────────────

/**
 * Walk unifié — utilise `walkWithIndex` (lib/agent/step-key.ts) pour partager
 * exactement le même index global que l'orchestrateur et le résolveur.
 */
function walkSteps(
  steps: AgentStep[],
  outputKeys: Set<string>,
  acc: NeededInput[],
  pinnedAcc: NeededInput[],
): void {
  for (const w of walkWithIndex(steps)) {
    const step = w.step;
    const idx = w.stepIndex;

    if (step.type === "llm") {
      for (const key of extractInputVariables(step.prompt)) {
        if (isFakeVariable(key) || isStepOutputKey(key, outputKeys)) continue;
        acc.push({
          key,
          source: "subscriber",
          kind: "text",
          label: keyToLabel(key),
          required: true,
        });
      }
      continue;
    }

    if (step.type === "retrieve") {
      for (const key of extractInputVariables(step.query)) {
        if (isFakeVariable(key) || isStepOutputKey(key, outputKeys)) continue;
        acc.push({
          key,
          source: "subscriber",
          kind: "text",
          label: keyToLabel(key),
          required: true,
        });
      }
      continue;
    }

    if (step.type === "condition") {
      for (const key of extractInputVariables(step.expression)) {
        if (isFakeVariable(key) || isStepOutputKey(key, outputKeys)) continue;
        acc.push({
          key,
          source: "subscriber",
          kind: "text",
          label: keyToLabel(key),
          required: true,
        });
      }
      continue;
    }

    if (step.type !== "action") continue;

    const actionInputs = actionInputsForStep(step);
    const stepShared = step.sharedEnv === true;

    for (const [paramKey, rawValue] of Object.entries(step.params ?? {})) {
      const meta = step.paramMeta?.[paramKey] as ParamMeta | undefined;
      const inputDef = actionInputs.find((i) => i.key === paramKey);
      const label = inputDef?.label ?? keyToLabel(paramKey);
      const help = inputDef?.help?.trim() || undefined;
      const placeholder = inputDef?.placeholder?.trim() || undefined;
      const kind = kindFromInputDef(inputDef);

      // 1) Placeholder ressource {{resource:type}}
      if (isResourcePlaceholder(rawValue)) {
        const resourceType = rawValue.trim().slice("{{resource:".length, -2);
        const fieldKey = stepKey(idx, paramKey);
        const source: NeededInputSource = stepShared
          ? "shared"
          : meta?.shared
            ? "shared"
            : meta?.scope === "builder_test"
              ? "pinned"
              : "subscriber";
        acc.push({
          key: fieldKey,
          source,
          kind: inputDef?.kind === "identity" ? "identity" : "resource",
          resourceType,
          connectorParam: { connector: step.connector, key: paramKey, stepIndex: idx },
          label,
          help,
          placeholder,
          required: inputDef?.required ?? true,
        });
        continue;
      }

      // 2) Littéral épinglé (builder_test/shared) → pas demandé
      if (isLiteralValue(rawValue, meta)) {
        pinnedAcc.push({
          key: stepKey(idx, paramKey),
          source: sourceFromMeta(meta),
          kind,
          connectorParam: { connector: step.connector, key: paramKey, stepIndex: idx },
          label,
          help,
          placeholder,
          value: rawValue,
          required: inputDef?.required ?? true,
        });
        continue;
      }

      // 3) Étape shared (env créateur) → ressource/champ déjà fourni
      if (stepShared) {
        pinnedAcc.push({
          key: stepKey(idx, paramKey),
          source: "shared",
          kind,
          connectorParam: { connector: step.connector, key: paramKey, stepIndex: idx },
          label,
          help,
          placeholder,
          value: rawValue,
          required: inputDef?.required ?? true,
        });
        continue;
      }

      // 4) Binding {{key}}
      const bound = bindingKeyOf(rawValue);
      if (bound) {
        if (isFakeVariable(bound) || isStepOutputKey(bound, outputKeys)) continue;
        // Param avec defaultValue runtime : ne pas demander sauf si explicitement scope=end_user
        if (inputDef && inputHasRuntimeDefault(inputDef) && meta?.scope !== "end_user") {
          continue;
        }
        acc.push({
          key: bound,
          source: "subscriber",
          kind,
          connectorParam: { connector: step.connector, key: paramKey, stepIndex: idx },
          label,
          help,
          placeholder,
          required: inputDef?.required ?? true,
        });
        continue;
      }

      // 5) Vide + requis sans défaut → on demande sous une clé dérivée
      if (!rawValue?.trim() && inputDef?.required && !inputHasRuntimeDefault(inputDef)) {
        const fallbackKey = `${step.connector}_${paramKey}`;
        acc.push({
          key: fallbackKey,
          source: "subscriber",
          kind,
          connectorParam: { connector: step.connector, key: paramKey, stepIndex: idx },
          label,
          help,
          placeholder,
          required: true,
        });
      }
    }
  }
}

/** Dédoublonne par `key` (un même {{destinataire}} = un seul champ). */
function dedupeByKey(inputs: NeededInput[]): NeededInput[] {
  const map = new Map<string, NeededInput>();
  for (const inp of inputs) {
    const existing = map.get(inp.key);
    if (!existing) {
      map.set(inp.key, inp);
      continue;
    }
    // Conserve l'occurrence la plus « riche » (label/help/connectorParam non nuls)
    map.set(inp.key, {
      ...existing,
      label: existing.label || inp.label,
      help: existing.help ?? inp.help,
      placeholder: existing.placeholder ?? inp.placeholder,
      connectorParam: existing.connectorParam ?? inp.connectorParam,
      required: existing.required || inp.required,
    });
  }
  return Array.from(map.values());
}

/**
 * Tous les besoins dérivés des étapes (asked + pinned + shared) — source de
 * vérité pour le Pilier B (résolveur). Les helpers `askedInputs` /
 * `resourceInputs` filtrent ce qui est demandé à l'abonné au run.
 */
export function deriveInterface(steps: AgentStep[]): NeededInput[] {
  const outputKeys = collectOutputKeys(steps);
  const asked: NeededInput[] = [];
  const pinned: NeededInput[] = [];
  walkSteps(steps, outputKeys, asked, pinned);
  return [...dedupeByKey(asked), ...pinned];
}

/** Snapshot complet du Contrat (étapes + interface dérivée). */
export function buildContract(steps: AgentStep[]): AgentContract {
  return { steps, interface: deriveInterface(steps) };
}

/** Champs demandés à l'abonné (texte/email/textarea/number). */
export function askedInputs(contract: AgentContract): NeededInput[] {
  return contract.interface.filter(
    (i) =>
      i.source === "subscriber" &&
      (i.kind === "text" ||
        i.kind === "email" ||
        i.kind === "textarea" ||
        i.kind === "number"),
  );
}

/** Ressources/identités à choisir/épingler (pickers). */
export function resourceInputs(contract: AgentContract): NeededInput[] {
  return contract.interface.filter(
    (i) =>
      (i.kind === "resource" || i.kind === "identity") && i.source === "subscriber",
  );
}

export type { ParamScope };
