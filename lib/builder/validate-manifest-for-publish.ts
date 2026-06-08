import type { AgentManifest, AgentStep, BaseAgentStep } from "@/lib/agent/schema";
import { validateAgentManifest, hasBlockingIssues } from "@/lib/builder/validate-agent";
import { isBinding, getRequiredActionParams } from "@/lib/connectors/action-requirements";
import {
  isResourcePlaceholder,
  resourcePlaceholder,
} from "@/lib/connectors/param-bindings";
import { getConnectorAction } from "@/lib/connectors/registry";
import { buildContract } from "@/lib/agent/contract";
import { resolveAgentInterface } from "@/lib/agent/resolve-interface";

export interface CredentialLeakIssue {
  code: string;
  message: string;
  stepIndex?: number;
}

const SECRET_PATTERNS: { code: string; re: RegExp; message: string }[] = [
  { code: "leaked_openai_key", re: /sk-[a-zA-Z0-9]{20,}/, message: "Clé OpenAI détectée dans le manifeste." },
  { code: "leaked_google_key", re: /AIza[0-9A-Za-z_-]{35}/, message: "Clé Google AI détectée dans le manifeste." },
  { code: "leaked_slack_token", re: /xox[baprs]-[0-9a-zA-Z-]+/, message: "Token Slack détecté dans le manifeste." },
  { code: "leaked_bearer", re: /Bearer\s+[a-zA-Z0-9._-]{10,}/i, message: "Jeton Bearer détecté dans le manifeste." },
];

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/;

function scanText(text: string, stepIndex?: number): CredentialLeakIssue[] {
  const issues: CredentialLeakIssue[] = [];
  for (const { code, re, message } of SECRET_PATTERNS) {
    if (re.test(text)) {
      issues.push({ code, message, stepIndex });
    }
  }
  return issues;
}

function scanSteps(steps: AgentStep[], stepOffset = 0): CredentialLeakIssue[] {
  const issues: CredentialLeakIssue[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const idx = stepOffset + i;

    if (step.type === "llm") {
      issues.push(...scanText(step.prompt, idx));
    }
    if (step.type === "code") {
      issues.push(...scanText(step.source, idx));
    }
    if (step.type === "action") {
      const allowLiterals = step.sharedEnv === true;
      for (const [key, value] of Object.entries(step.params ?? {})) {
        const required = getRequiredActionParams(step.connector, step.action);
        if (!isBinding(value) && !isResourcePlaceholder(value)) {
          if (!allowLiterals) {
            if (required.includes(key) && (key === "to" || key === "from")) {
              issues.push({
                code: "literal_required_param",
                message: `Étape ${idx + 1} : le paramètre « ${key} » doit être un binding ou {{resource:…}}, pas une valeur en dur.`,
                stepIndex: idx,
              });
            } else if (required.includes(key) && !step.paramMeta?.[key]?.shared) {
              issues.push({
                code: "literal_required_param",
                message: `Étape ${idx + 1} : le paramètre « ${key} » doit être un binding {{variable}} ou une ressource, pas une valeur en dur.`,
                stepIndex: idx,
              });
            }
            if (EMAIL_RE.test(value)) {
              issues.push({
                code: "literal_email_in_param",
                message: `Étape ${idx + 1} : email en dur dans « ${key} » — utilisez {{variable}} ou {{resource:…}}.`,
                stepIndex: idx,
              });
            }
            if (PHONE_RE.test(value)) {
              issues.push({
                code: "literal_phone_in_param",
                message: `Étape ${idx + 1} : téléphone en dur dans « ${key} » — utilisez {{variable}}.`,
                stepIndex: idx,
              });
            }
          }
          issues.push(...scanText(value, idx));
        }
      }
    }
    if (step.type === "tool") {
      for (const value of Object.values(step.params ?? {})) {
        if (!isBinding(value)) issues.push(...scanText(value, idx));
      }
    }
    if (step.type === "parallel") {
      for (const branch of step.branches) {
        issues.push(...scanSteps(branch.steps as AgentStep[], idx));
      }
    }
  }
  return issues;
}

/** Rejette toute fuite de credentials ou valeur sensible dans le manifeste publié. */
export function assertNoLeakedCredentials(manifest: AgentManifest): void {
  const issues = scanSteps(manifest.steps);
  if (issues.length > 0) {
    throw new Error(issues[0].message);
  }
}

/** Retire les ressources builder_test du manifeste vendu. */
export function stripBuilderResources(manifest: AgentManifest): AgentManifest {
  function stripSteps(steps: AgentStep[]): AgentStep[] {
    return steps.map((step) => {
      if (step.type === "parallel") {
        return {
          ...step,
          branches: step.branches.map((b) => ({
            ...b,
            steps: stripSteps(b.steps as AgentStep[]) as BaseAgentStep[],
          })),
        };
      }
      if (step.type !== "action") return step;
      if (step.sharedEnv) {
        return step;
      }
      const params = { ...(step.params ?? {}) };
      const paramMeta = { ...(step.paramMeta ?? {}) };
      for (const [key, meta] of Object.entries(paramMeta)) {
        if (meta.scope === "builder_test" && !meta.shared && params[key]) {
          const rt =
            meta.resourceType ??
            getConnectorAction(step.connector, step.action)?.inputs.find((i) => i.key === key)
              ?.resourceType ??
            key;
          params[key] = resourcePlaceholder(rt);
          paramMeta[key] = { ...meta, scope: "end_user" };
        }
      }
      return { ...step, params, paramMeta };
    });
  }

  return { ...manifest, steps: stripSteps(manifest.steps) };
}

/** Ne conserve que déclarations structurelles — pas de runtime builder. */
export function stripManifestForPublish(manifest: AgentManifest): AgentManifest {
  const stripped = stripBuilderResources(manifest);
  const steps = stripped.steps.map((step) => {
    if (step.type !== "action" && step.type !== "tool") return step;
    const cleanParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(step.params ?? {})) {
      if (isBinding(value) || isResourcePlaceholder(value)) {
        cleanParams[key] = value;
      } else {
        cleanParams[key] = `{{${key}}}`;
      }
    }
    if (step.type === "action") {
      if (step.sharedEnv) {
        const { paramMeta: _m, ...rest } = step;
        void _m;
        return rest;
      }
      return { type: "action" as const, connector: step.connector, action: step.action, params: cleanParams, outputKey: step.outputKey };
    }
    return { ...step, params: cleanParams };
  });

  return {
    ...stripped,
    steps,
    connectors: Array.from(new Set(stripped.connectors)),
    secrets: Array.from(new Set(stripped.secrets)),
    inputs: stripped.inputs.map((input) => ({
      key: input.key,
      label: input.label,
      type: input.type,
      required: input.required,
      help: input.help,
    })),
  };
}

export function getManifestValidationErrors(manifest: AgentManifest): string[] {
  const issues = validateAgentManifest(manifest.steps, {
    connectors: manifest.connectors,
    inputKeys: manifest.inputs.map((i) => i.key),
  });
  return issues
    .filter((i) => i.severity === "error")
    .map((i) => i.message);
}

/**
 * P2.5 : assertion supplémentaire via le Résolveur en phase « sell ».
 *
 * Garantit qu'aucune valeur builder épinglée non-shared ne traîne dans le
 * manifeste publié (compl. anti-fuite). Si le strip a oublié quelque chose,
 * le résolveur le verra encore en source=pinned (au lieu de ask), et on rejette.
 */
function assertSellPhaseConsistent(stripped: AgentManifest): void {
  try {
    const contract = buildContract(stripped.steps);
    const resolved = resolveAgentInterface(contract, { phase: "sell" });
    // En phase sell, plus aucun `pinned` non-shared ne doit subsister.
    const leftovers = resolved.filter(
      (r) => r.source === "pinned" && r.required,
    );
    if (leftovers.length > 0) {
      const detail = leftovers
        .map((l) => `${l.connectorParam?.connector ?? "?"}.${l.connectorParam?.key ?? l.key}`)
        .join(", ");
      throw new Error(
        `Manifeste : ${leftovers.length} valeur(s) builder épinglée(s) non purgée(s) : ${detail}`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Manifeste")) throw err;
    // best-effort : si le contrat ne peut pas être bâti (manifest atypique), on n'empêche pas la publication
  }
}

export function assertManifestValidForPublish(manifest: AgentManifest): void {
  const stripped = stripManifestForPublish(manifest);
  assertNoLeakedCredentials(stripped);
  assertSellPhaseConsistent(stripped);
  const errors = getManifestValidationErrors(stripped);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
  if (
    hasBlockingIssues(
      validateAgentManifest(stripped.steps, {
        connectors: stripped.connectors,
        inputKeys: stripped.inputs.map((i) => i.key),
      }),
    )
  ) {
    throw new Error("Manifeste agent invalide");
  }
}
