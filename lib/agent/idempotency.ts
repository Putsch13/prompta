import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ExecutionStatus = "started" | "completed" | "failed";

/**
 * Clé d'exécution déterministe incluant un hash des params mappés.
 */
export function buildExecutionKey(
  runId: string,
  stepIndex: number,
  actionSlug: string,
  params?: Record<string, string>,
): string {
  const paramsHash = params
    ? createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 16)
    : "";
  const raw = `${runId}:${stepIndex}:${actionSlug}:${paramsHash}`;
  return createHash("sha256").update(raw).digest("hex");
}

export interface IdempotentResult {
  alreadyExecuted: boolean;
  previousOutput: string | null;
  executionId: string | null;
  inProgress?: boolean;
}

/**
 * Retourne un résultat précédent uniquement si l'action est completed.
 */
export async function checkIdempotency(
  runId: string,
  stepIndex: number,
  actionSlug: string,
  params?: Record<string, string>,
): Promise<IdempotentResult> {
  const admin = createAdminClient();
  const executionKey = buildExecutionKey(runId, stepIndex, actionSlug, params);

  const { data } = await admin
    .from("agent_action_executions")
    .select("id, result_output, status")
    .eq("run_id", runId)
    .eq("execution_key", executionKey)
    .maybeSingle();

  if (!data) {
    return { alreadyExecuted: false, previousOutput: null, executionId: null };
  }

  if (data.status === "completed" && data.result_output != null) {
    return {
      alreadyExecuted: true,
      previousOutput: data.result_output,
      executionId: data.id,
    };
  }

  if (data.status === "started") {
    return {
      alreadyExecuted: true,
      previousOutput: null,
      executionId: data.id,
      inProgress: true,
    };
  }

  return { alreadyExecuted: false, previousOutput: null, executionId: data.id };
}

/**
 * Réserve l'exécution (status started) avant l'appel externe.
 */
export async function beginExecution(
  runId: string,
  stepIndex: number,
  actionSlug: string,
  params?: Record<string, string>,
): Promise<string> {
  const admin = createAdminClient();
  const executionKey = buildExecutionKey(runId, stepIndex, actionSlug, params);
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("agent_action_executions")
    .insert({
      run_id: runId,
      step_index: stepIndex,
      action_slug: actionSlug,
      execution_key: executionKey,
      status: "started",
      updated_at: now,
    })
    .select("id")
    .single();

  if (!error) {
    return data.id as string;
  }

  if (error.code !== "23505") {
    throw new Error(`Réservation exécution échouée: ${error.message}`);
  }

  const cached = await checkIdempotency(runId, stepIndex, actionSlug, params);
  if (cached.alreadyExecuted && cached.previousOutput != null) {
    return cached.executionId ?? "";
  }

  const { data: existing } = await admin
    .from("agent_action_executions")
    .select("id, status")
    .eq("run_id", runId)
    .eq("execution_key", executionKey)
    .maybeSingle();

  if (existing?.status === "started") {
    throw new Error("Action externe déjà en cours pour cette étape — relance manuelle requise.");
  }

  if (existing?.id) {
    await admin
      .from("agent_action_executions")
      .update({ status: "started", error_message: null, updated_at: now })
      .eq("id", existing.id);
    return existing.id as string;
  }

  throw new Error("Conflit idempotence — réessayez.");
}

export async function completeExecution(
  executionId: string,
  resultOutput: string,
  externalId?: string | null,
): Promise<void> {
  if (!executionId) return;
  const admin = createAdminClient();
  await admin
    .from("agent_action_executions")
    .update({
      status: "completed",
      result_output: resultOutput,
      external_id: externalId ?? null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", executionId);
}

export async function failExecution(executionId: string, errorMessage: string): Promise<void> {
  if (!executionId) return;
  const admin = createAdminClient();
  await admin
    .from("agent_action_executions")
    .update({
      status: "failed",
      error_message: errorMessage.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", executionId);
}

/**
 * @deprecated Préférer beginExecution + completeExecution
 */
export async function recordExecution(
  runId: string,
  stepIndex: number,
  actionSlug: string,
  resultOutput: string,
  params?: Record<string, string>,
): Promise<string> {
  const executionId = await beginExecution(runId, stepIndex, actionSlug, params);
  await completeExecution(executionId, resultOutput);
  return executionId;
}
