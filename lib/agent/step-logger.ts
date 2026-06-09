import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StepLog {
  runId: string;
  stepIndex: number;
  stepId?: string;
  stepType: string;
  label?: string;
  provider?: string;
  model?: string;
  toolSlug?: string;
  actionSlug?: string;
}

/** Clés dont la valeur est systématiquement masquée (secrets). */
const SECRET_KEY_RE = /(api[_-]?key|secret|token|password|passwd|authorization|bearer|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|credential)/i;

/** Motifs de secrets à masquer dans une chaîne libre. */
const SECRET_VALUE_PATTERNS: { re: RegExp; replace: string }[] = [
  { re: /Bearer\s+[A-Za-z0-9._~+/-]+=*/g, replace: "Bearer [redacted]" },
  { re: /(x-api-key["'\s:=]+)[A-Za-z0-9._-]+/gi, replace: "$1[redacted]" },
  { re: /sk-[A-Za-z0-9]{16,}/g, replace: "sk-[redacted]" },
  { re: /(ya29|1\/\/)[A-Za-z0-9._-]{10,}/g, replace: "[redacted-oauth-token]" },
];

/** Masque récursivement les valeurs sensibles d'un objet (P0-3 sécurité). */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (value == null) return value;
  if (typeof value === "string") {
    let out = value;
    for (const { re, replace } of SECRET_VALUE_PATTERNS) out = out.replace(re, replace);
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "[redacted]" : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

function truncateJson(obj: unknown, maxChars = 2000): unknown {
  if (obj === null || obj === undefined) return null;
  const safe = redactSecrets(obj);
  const str = JSON.stringify(safe);
  if (str.length <= maxChars) return safe;
  return { _truncated: true, preview: str.slice(0, maxChars) };
}

/** Masque les secrets d'une chaîne d'erreur libre. */
function redactString(message: string): string {
  let out = message;
  for (const { re, replace } of SECRET_VALUE_PATTERNS) out = out.replace(re, replace);
  return out;
}

export async function logStepStarted(step: StepLog): Promise<string> {
  const admin = createAdminClient();
  const { data } = await (admin as any).from("listing_agent_run_steps").insert({
    run_id: step.runId,
    step_index: step.stepIndex,
    step_id: step.stepId ?? null,
    step_type: step.stepType,
    label: step.label ?? null,
    status: "running",
    started_at: new Date().toISOString(),
    provider: step.provider ?? null,
    model: step.model ?? null,
    tool_slug: step.toolSlug ?? null,
    action_slug: step.actionSlug ?? null,
  }).select("id").single();

  return data?.id ?? "";
}

export async function logStepSuccess(
  stepDbId: string,
  output: unknown,
  usage?: { inputTokens?: number; outputTokens?: number },
  startedAt?: Date
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date();
  const durationMs = startedAt ? now.getTime() - startedAt.getTime() : null;

  await (admin as any).from("listing_agent_run_steps").update({
    status: "success",
    finished_at: now.toISOString(),
    duration_ms: durationMs,
    output_preview: truncateJson(output),
    usage: usage ? { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } : null,
  }).eq("id", stepDbId);
}

export interface StepErrorDetail {
  toolSlug?: string;
  actionSlug?: string;
  connector?: string;
  params?: Record<string, unknown>;
  rawProviderError?: string;
}

export async function logStepFailed(
  stepDbId: string,
  errorCode: string,
  errorMessage: string,
  startedAt?: Date,
  detail?: StepErrorDetail
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date();
  const durationMs = startedAt ? now.getTime() - startedAt.getTime() : null;

  const errorDetail = detail
    ? {
        toolSlug: detail.toolSlug ?? null,
        actionSlug: detail.actionSlug ?? null,
        connector: detail.connector ?? null,
        params_redacted: detail.params ? redactSecrets(detail.params) : null,
        raw_provider_error: detail.rawProviderError
          ? redactString(detail.rawProviderError).slice(0, 2000)
          : null,
      }
    : null;

  await (admin as any).from("listing_agent_run_steps").update({
    status: "failed",
    finished_at: now.toISOString(),
    duration_ms: durationMs,
    error_code: errorCode,
    error_message: redactString(errorMessage).slice(0, 2000),
    error_detail: errorDetail,
  }).eq("id", stepDbId);
}

export async function logStepSkipped(
  runId: string,
  stepIndex: number,
  stepId: string | undefined,
  stepType: string,
  label: string | undefined,
  reason: string
): Promise<void> {
  const admin = createAdminClient();
  await (admin as any).from("listing_agent_run_steps").insert({
    run_id: runId,
    step_index: stepIndex,
    step_id: stepId ?? null,
    step_type: stepType,
    label: label ?? null,
    status: "skipped",
    error_message: reason,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: 0,
  });
}

export async function updateStepInput(stepDbId: string, input: unknown): Promise<void> {
  const admin = createAdminClient();
  await (admin as any).from("listing_agent_run_steps").update({
    input_preview: truncateJson(input),
  }).eq("id", stepDbId);
}
