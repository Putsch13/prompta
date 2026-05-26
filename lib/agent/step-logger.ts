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

function truncateJson(obj: unknown, maxChars = 2000): unknown {
  if (obj === null || obj === undefined) return null;
  const str = JSON.stringify(obj);
  if (str.length <= maxChars) return obj;
  return { _truncated: true, preview: str.slice(0, maxChars) };
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

export async function logStepFailed(
  stepDbId: string,
  errorCode: string,
  errorMessage: string,
  startedAt?: Date
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date();
  const durationMs = startedAt ? now.getTime() - startedAt.getTime() : null;

  await (admin as any).from("listing_agent_run_steps").update({
    status: "failed",
    finished_at: now.toISOString(),
    duration_ms: durationMs,
    error_code: errorCode,
    error_message: errorMessage.slice(0, 2000),
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
