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
  if (isComposioEnabled() && !isNativeAction(actionId)) {
    return executeComposioTool(actionId, ctx.userId, params);
  }
  return executeNativeConnectorAction(actionId, params, ctx);
}
