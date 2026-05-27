/**
 * Validation forte d'un manifest agent avant publication.
 * Détecte les problèmes que le builder doit bloquer.
 */

import type { AgentStep } from "@/lib/agent/schema";

export interface AgentValidationIssue {
  stepIndex: number | null;
  severity: "error" | "warning";
  code: string;
  message: string;
}

const STEP_REF_RE = /\{\{step_(\d+)_output(?:\.[\w.]+)?\}\}/g;
const ALL_VARS_RE = /\{\{([\w.]+)\}\}/g;
const FAKE_VARS = new Set(["variable", "input", "step_N_output"]);

function isStepRef(key: string): boolean {
  return /^step_\d+_output/.test(key);
}

function isFakeVar(key: string): boolean {
  return FAKE_VARS.has(key) || key === "step_N_output";
}

export function validateAgentManifest(
  steps: AgentStep[],
  options?: { connectors?: string[] },
): AgentValidationIssue[] {
  const issues: AgentValidationIssue[] = [];
  const outputKeys = new Set<string>();
  const seenOutputKeys = new Map<string, number>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Prompt vide
    if (step.type === "llm") {
      const prompt = step.prompt?.trim() ?? "";
      if (!prompt) {
        issues.push({
          stepIndex: i,
          severity: "error",
          code: "empty_prompt",
          message: `Étape ${i + 1} (LLM) : le prompt est vide.`,
        });
      }
    }

    // Code vide
    if (step.type === "code") {
      const source = step.source?.trim() ?? "";
      if (!source) {
        issues.push({
          stepIndex: i,
          severity: "error",
          code: "empty_code",
          message: `Étape ${i + 1} (Code) : le code source est vide.`,
        });
      }
    }

    // Retrieve sans query
    if (step.type === "retrieve") {
      const query = step.query?.trim() ?? "";
      if (!query) {
        issues.push({
          stepIndex: i,
          severity: "error",
          code: "empty_retrieve_query",
          message: `Étape ${i + 1} (Retrieve) : la requête est vide.`,
        });
      }
    }

    // Action : connecteur obligatoire
    if (step.type === "action") {
      if (!step.connector?.trim()) {
        issues.push({
          stepIndex: i,
          severity: "error",
          code: "action_no_connector",
          message: `Étape ${i + 1} (Action) : aucun connecteur spécifié.`,
        });
      }
      if (!step.action?.trim()) {
        issues.push({
          stepIndex: i,
          severity: "error",
          code: "action_no_action",
          message: `Étape ${i + 1} (Action) : aucune action spécifiée.`,
        });
      }
    }

    // Vérifier les références step_X_output : pas de référence future
    const textFields = getStepTextFields(step);
    for (const text of textFields) {
      let match: RegExpExecArray | null;
      STEP_REF_RE.lastIndex = 0;
      while ((match = STEP_REF_RE.exec(text)) !== null) {
        const refIdx = parseInt(match[1], 10);
        if (refIdx >= i) {
          issues.push({
            stepIndex: i,
            severity: "error",
            code: "future_step_reference",
            message: `Étape ${i + 1} : référence à step_${refIdx}_output est invalide (étape future ou elle-même).`,
          });
        }
      }
    }

    // OutputKey dupliqué
    const key = step.outputKey?.trim();
    if (key) {
      if (seenOutputKeys.has(key)) {
        issues.push({
          stepIndex: i,
          severity: "error",
          code: "duplicate_output_key",
          message: `Étape ${i + 1} : outputKey "${key}" déjà utilisé à l'étape ${(seenOutputKeys.get(key) ?? 0) + 1}.`,
        });
      } else {
        seenOutputKeys.set(key, i);
      }
      outputKeys.add(key);
    }
  }

  // Variables non résolues (hors step refs et fake vars)
  const allVarRefs = new Set<string>();
  for (const step of steps) {
    for (const text of getStepTextFields(step)) {
      let match: RegExpExecArray | null;
      ALL_VARS_RE.lastIndex = 0;
      while ((match = ALL_VARS_RE.exec(text)) !== null) {
        const varName = match[1];
        if (!isFakeVar(varName) && !isStepRef(varName)) {
          allVarRefs.add(varName);
        }
      }
    }
  }

  // Connecteurs requis mais non listés dans manifest
  if (options?.connectors) {
    const connectorSet = new Set(options.connectors);
    for (const step of steps) {
      if (step.type === "action" && step.connector && !connectorSet.has(step.connector)) {
        issues.push({
          stepIndex: null,
          severity: "warning",
          code: "unlisted_connector",
          message: `Connecteur "${step.connector}" utilisé dans une action mais non listé dans le manifest.`,
        });
      }
    }
  }

  return issues;
}

function getStepTextFields(step: AgentStep): string[] {
  const fields: string[] = [];
  if (step.type === "llm" && step.prompt) fields.push(step.prompt);
  if (step.type === "code" && step.source) fields.push(step.source);
  if (step.type === "retrieve" && step.query) fields.push(step.query);
  if (step.type === "condition" && step.expression) fields.push(step.expression);
  if (step.type === "approval" && step.payloadTemplate) fields.push(step.payloadTemplate);
  if (step.type === "action" && step.params) {
    fields.push(...Object.values(step.params));
  }
  if (step.type === "tool" && step.params) {
    fields.push(...Object.values(step.params));
  }
  return fields;
}

/** Filtrer seulement les erreurs (pas les warnings). */
export function hasBlockingIssues(issues: AgentValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
