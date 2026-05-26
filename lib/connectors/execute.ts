import type { ExecuteContext, ExecuteResult } from "./types";
import { executeNativeConnectorAction } from "./execute-native";
import { isComposioEnabled } from "@/lib/composio/client";
import { ComposioExecutionError, executeComposioTool } from "@/lib/composio/execute";

/** Actions legacy maison (gmail.send, slack.send…) */
function isNativeAction(actionId: string): boolean {
  return actionId.includes(".") && actionId === actionId.toLowerCase();
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
      output: `[APERÇU — aucune action réelle]\nAction : ${actionId}\n${summary || "(sans paramètres)"}`,
      metadata: { simulated: true },
    };
  }

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
}
