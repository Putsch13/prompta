import type { ExecuteContext, ExecuteResult } from "./types";
import { executeNativeConnectorAction } from "./execute-native";
import { isComposioEnabled } from "@/lib/composio/client";
import { ComposioExecutionError, executeComposioTool } from "@/lib/composio/execute";

/** Actions legacy maison (gmail.send, slack.send…) */
function isNativeAction(actionId: string): boolean {
  return actionId.includes(".") && actionId === actionId.toLowerCase();
}

const RETRY_BACKOFF_MS = [1000, 3000, 9000];
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const MAX_ATTEMPTS = 3;

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang up/i.test(msg)) {
      return true;
    }
    const statusMatch = msg.match(/\[(\d{3})\]/);
    if (statusMatch && RETRYABLE_STATUS_CODES.has(Number(statusMatch[1]))) {
      return true;
    }
  }
  return false;
}

async function withRetry<T>(
  actionId: string,
  fn: () => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1 && isRetryableError(err)) {
        const delay = RETRY_BACKOFF_MS[attempt];
        console.warn(
          `[connector:retry] action=${actionId} attempt=${attempt + 1}/${MAX_ATTEMPTS} ` +
          `retrying in ${delay}ms — ${err instanceof Error ? err.message : String(err)}`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function executeConnectorAction(
  actionId: string,
  params: Record<string, string>,
  ctx: ExecuteContext
): Promise<ExecuteResult> {
  if (ctx.dryRun) {
    const summary = Object.entries(params)
      .map(([k, v]) => `${k}: ${v.slice(0, 80)}`)
      .join(", ");
    return {
      output: `[APERÇU — aucune action réelle]\nAction : ${actionId}\n${summary || "(sans paramètres)"}\n(dry-run — rien n'a été envoyé aux services externes)`,
      metadata: { simulated: true },
    };
  }

  return withRetry(actionId, async () => {
    if (isComposioEnabled() && !isNativeAction(actionId)) {
      try {
        return await executeComposioTool(actionId, ctx.userId, params, {
          toolkitSlug: actionId.split("_")[0]?.toLowerCase(),
        });
      } catch (err) {
        if (err instanceof ComposioExecutionError) {
          throw new Error(`[${err.details.code}] ${err.details.message}`);
        }
        throw err;
      }
    }
    return executeNativeConnectorAction(actionId, params, ctx);
  });
}
