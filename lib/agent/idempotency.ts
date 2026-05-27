import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Génère une clé d'exécution unique et déterministe
 * pour un triplet (runId, stepIndex, actionSlug).
 */
export function buildExecutionKey(
  runId: string,
  stepIndex: number,
  actionSlug: string
): string {
  const raw = `${runId}:${stepIndex}:${actionSlug}`;
  return createHash("sha256").update(raw).digest("hex");
}

export interface IdempotentResult {
  alreadyExecuted: boolean;
  previousOutput: string | null;
  executionId: string | null;
}

/**
 * Vérifie si une action a déjà été exécutée pour ce run/step/action.
 * Si oui, retourne le résultat précédent sans ré-exécuter.
 */
export async function checkIdempotency(
  runId: string,
  stepIndex: number,
  actionSlug: string
): Promise<IdempotentResult> {
  const admin = createAdminClient();
  const executionKey = buildExecutionKey(runId, stepIndex, actionSlug);

  const { data } = await (admin as any)
    .from("agent_action_executions")
    .select("id, result_output")
    .eq("run_id", runId)
    .eq("execution_key", executionKey)
    .maybeSingle();

  if (data) {
    return {
      alreadyExecuted: true,
      previousOutput: data.result_output,
      executionId: data.id,
    };
  }

  return { alreadyExecuted: false, previousOutput: null, executionId: null };
}

/**
 * Enregistre le résultat d'une action exécutée avec succès
 * pour garantir l'idempotence lors de re-tentatives.
 */
export async function recordExecution(
  runId: string,
  stepIndex: number,
  actionSlug: string,
  resultOutput: string
): Promise<string> {
  const admin = createAdminClient();
  const executionKey = buildExecutionKey(runId, stepIndex, actionSlug);

  const { data, error } = await (admin as any)
    .from("agent_action_executions")
    .insert({
      run_id: runId,
      step_index: stepIndex,
      action_slug: actionSlug,
      execution_key: executionKey,
      result_output: resultOutput,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const existing = await checkIdempotency(runId, stepIndex, actionSlug);
      return existing.executionId ?? "";
    }
    throw new Error(`Enregistrement exécution échoué: ${error.message}`);
  }

  return data.id as string;
}
