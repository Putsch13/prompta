import { getComposioClient } from "./client";

export async function executeComposioTool(
  toolSlug: string,
  userId: string,
  arguments_: Record<string, string>
): Promise<{ output: string; metadata?: Record<string, unknown> }> {
  const composio = getComposioClient();

  const parsedArgs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(arguments_)) {
    if (v === "") continue;
    try {
      parsedArgs[k] = JSON.parse(v);
    } catch {
      parsedArgs[k] = v;
    }
  }

  const result = await composio.tools.execute(toolSlug, {
    userId,
    arguments: parsedArgs,
  });

  const successful = (result as { successful?: boolean }).successful ?? true;
  if (!successful) {
    const err =
      (result as { error?: string }).error ??
      (result as { message?: string }).message ??
      "Échec Composio";
    throw new Error(`Composio ${toolSlug} : ${err}`);
  }

  const data = (result as { data?: unknown }).data ?? result;
  const output =
    typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 12000);

  return { output, metadata: { composio: true, toolSlug } };
}
