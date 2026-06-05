import type { ActionInput } from "./types";

export type ParamScope = "builder_test" | "end_user" | "dynamic";
export type ParamKind = "static" | "input" | "step_ref" | "resource" | "identity";

export interface ParamMeta {
  scope: ParamScope;
  resourceType?: string;
  shared?: boolean;
}

const BINDING_RE = /^\s*\{\{([\w.:]+)\}\}\s*$/;
const RESOURCE_PLACEHOLDER_RE = /^\{\{resource:([\w.]+)\}\}$/;

export function isParamBinding(v?: string): boolean {
  if (!v) return false;
  return BINDING_RE.test(v);
}

export function isResourcePlaceholder(v?: string): boolean {
  if (!v) return false;
  return RESOURCE_PLACEHOLDER_RE.test(v.trim());
}

export function resourcePlaceholder(resourceType: string): string {
  return `{{resource:${resourceType}}}`;
}

export function inferParamKind(input: ActionInput, value?: string): ParamKind {
  if (input.kind) return input.kind;
  if (isResourcePlaceholder(value)) return "resource";
  if (value && isParamBinding(value)) {
    const inner = value.trim().slice(2, -2);
    if (inner.startsWith("resource:")) return "resource";
    if (inner.includes("_output")) return "step_ref";
    return "input";
  }
  return "static";
}

export function defaultScopeForInput(input: ActionInput): ParamScope {
  if (input.defaultScope) return input.defaultScope;
  if (input.kind === "resource" || input.kind === "identity") return "end_user";
  if (input.kind === "input" || input.kind === "step_ref") return "dynamic";
  return "end_user";
}

export function extractResourcePlaceholders(steps: {
  type: string;
  params?: Record<string, string>;
  branches?: { steps: unknown[] }[];
}[]): string[] {
  const found = new Set<string>();
  function walk(list: typeof steps) {
    for (const step of list) {
      if (step.type === "parallel" && step.branches) {
        for (const b of step.branches) walk(b.steps as typeof steps);
        continue;
      }
      if (step.type === "action" && step.params) {
        for (const v of Object.values(step.params)) {
          const m = v?.trim().match(RESOURCE_PLACEHOLDER_RE);
          if (m) found.add(m[1]);
        }
      }
    }
  }
  walk(steps);
  return Array.from(found);
}
