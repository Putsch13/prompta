export interface ComposioErrorResult {
  code: string;
  message: string;
  toolkitSlug?: string;
  actionSlug: string;
  connectedAccountStatus?: "connected" | "missing" | "expired";
  raw?: string;
}

export function parseComposioError(
  err: unknown,
  actionSlug: string,
  toolkitSlug?: string
): ComposioErrorResult {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  let code = "composio_error";
  let connectedAccountStatus: ComposioErrorResult["connectedAccountStatus"];

  if (lower.includes("not connected") || lower.includes("no connected account") || lower.includes("connection not found")) {
    code = "connection_missing";
    connectedAccountStatus = "missing";
  } else if (lower.includes("expired") || lower.includes("token")) {
    code = "connection_expired";
    connectedAccountStatus = "expired";
  } else if (lower.includes("unknown action") || lower.includes("tool not found") || lower.includes("not found")) {
    code = "unknown_action";
  } else if (lower.includes("permission") || lower.includes("403")) {
    code = "permission_denied";
  } else if (lower.includes("rate limit") || lower.includes("429")) {
    code = "rate_limit";
  }

  const message =
    code === "connection_missing"
      ? `Connectez ${toolkitSlug ?? "l'application"} avant d'exécuter cette action.`
      : code === "unknown_action"
        ? `Action inconnue : ${actionSlug}`
        : raw.slice(0, 500);

  return {
    code,
    message,
    toolkitSlug,
    actionSlug,
    connectedAccountStatus,
    raw: raw.slice(0, 300),
  };
}
