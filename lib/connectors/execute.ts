import type { ExecuteContext, ExecuteResult } from "./types";
import { executeNativeConnectorAction } from "./execute-native";
import { isComposioEnabled } from "@/lib/composio/client";
import { executeComposioTool } from "@/lib/composio/execute";

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
    return executeComposioTool(actionId, ctx.userId, params);
  }
  return executeNativeConnectorAction(actionId, params, ctx);
}
