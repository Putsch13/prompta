import { getComposioClient, isComposioEnabled } from "./client";
import { parseComposioError, type ComposioErrorResult } from "./errors";
import { getUserConnection } from "@/lib/connections";

export class ComposioExecutionError extends Error {
  readonly details: ComposioErrorResult;

  constructor(details: ComposioErrorResult) {
    super(details.message);
    this.name = "ComposioExecutionError";
    this.details = details;
  }
}

/** Type attendu d'un argument, pour un coercition fiable (P3-2). */
export type ComposioArgType = "object" | "array" | "number" | "boolean" | "string";

/**
 * Convertit une valeur string vers le type attendu.
 *
 * P3-2 : on NE parse PLUS agressivement chaque string (un titre « 123 » ou un
 * texte commençant par « [ » devenait un nombre / tableau par erreur). On ne
 * coerce que :
 *  - selon le type de schéma fourni (argTypes), si connu ;
 *  - sinon uniquement les objets/tableaux JSON (`{...}` / `[...]`), en gardant
 *    les scalaires (nombres, booléens, texte) tels quels.
 */
export function coerceArg(value: string, expected?: ComposioArgType): unknown {
  const trimmed = value.trim();
  if (expected) {
    switch (expected) {
      case "string":
        return value;
      case "number": {
        const n = Number(trimmed);
        return Number.isFinite(n) && trimmed !== "" ? n : value;
      }
      case "boolean":
        if (/^(true|false)$/i.test(trimmed)) return /^true$/i.test(trimmed);
        return value;
      case "object":
        try {
          return JSON.parse(trimmed);
        } catch {
          return value;
        }
      case "array":
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // Texte brut pour un TABLEAU attendu (audit : 228 params requis de ce
          // type sur 40 toolkits) : découpe en liste de chaînes plutôt que de
          // laisser le provider renvoyer un 400 « Input should be a valid list ».
          const parts = trimmed
            .split(/\r?\n|;|,/)
            .map((x) => x.trim())
            .filter(Boolean);
          return parts.length > 0 ? parts : [trimmed];
        }
    }
  }
  // Sans schéma : ne parser QUE les structures JSON explicites.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

export async function executeComposioTool(
  toolSlug: string,
  userId: string,
  arguments_: Record<string, string>,
  options?: {
    toolkitSlug?: string;
    actionVersion?: string;
    connectedAccountId?: string;
    argTypes?: Record<string, ComposioArgType>;
  }
): Promise<{ output: string; metadata?: Record<string, unknown> }> {
  const composio = getComposioClient();
  const toolkitSlug = options?.toolkitSlug ?? toolSlug.split("_")[0]?.toLowerCase();

  const parsedArgs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(arguments_)) {
    if (v === "") continue;
    parsedArgs[k] = coerceArg(v, options?.argTypes?.[k]);
  }

  try {
    let connectedAccountId = options?.connectedAccountId;
    if (!connectedAccountId) {
      let conn = await getUserConnection(userId, toolkitSlug);
      // Auto-réparation : la ligne DB peut exister (UI « connecté ») mais
      // pointer un compte Composio périmé/absent (allowMultiple crée plusieurs
      // comptes). On resynchronise depuis Composio avant d'abandonner — évite
      // le faux « Connectez X » alors que l'utilisateur est bien connecté.
      if (!conn?.accessToken) {
        try {
          const { checkComposioConnection } = await import("./connect");
          const healed = await checkComposioConnection(userId, toolkitSlug);
          if (healed) conn = await getUserConnection(userId, toolkitSlug);
        } catch {
          // best-effort — on laisse Composio résoudre par userId si possible
        }
      }
      connectedAccountId = conn?.accessToken;
    }

    // Composio exige une version de toolkit en exécution manuelle. On épingle
    // une version si fournie (option ou env COMPOSIO_TOOLKIT_VERSION), sinon on
    // exécute la dernière version en neutralisant la vérification stricte —
    // sans quoi l'appel lève « Toolkit version not specified ».
    const pinnedVersion =
      options?.actionVersion ?? process.env.COMPOSIO_TOOLKIT_VERSION?.trim();

    const result = await composio.tools.execute(toolSlug, {
      userId,
      ...(connectedAccountId ? { connectedAccountId } : {}),
      arguments: parsedArgs,
      ...(pinnedVersion
        ? { version: pinnedVersion }
        : { dangerouslySkipVersionCheck: true }),
    });

    const successful = (result as { successful?: boolean }).successful ?? true;
    if (!successful) {
      const errMsg =
        (result as { error?: string }).error ??
        (result as { message?: string }).message ??
        "Échec Composio";
      throw new ComposioExecutionError(
        parseComposioError(new Error(errMsg), toolSlug, toolkitSlug)
      );
    }

    const data = (result as { data?: unknown }).data ?? result;
    const output =
      typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 12000);

    return {
      output,
      metadata: { composio: true, toolSlug, toolkitSlug, actionVersion: options?.actionVersion },
    };
  } catch (err) {
    if (err instanceof ComposioExecutionError) throw err;
    throw new ComposioExecutionError(parseComposioError(err, toolSlug, toolkitSlug));
  }
}

export async function testComposioConnection(
  userId: string,
  toolkitSlug: string
): Promise<{ connected: boolean; provider: "composio" | "native"; accountId?: string; error?: string }> {
  if (!isComposioEnabled()) {
    return { connected: false, provider: "native", error: "COMPOSIO_API_KEY non configurée" };
  }

  let conn = await getUserConnection(userId, toolkitSlug);
  if (!conn) {
    // Auto-réparation : la ligne DB peut être périmée/incomplète. On vérifie
    // l'état réel côté Composio et on resynchronise avant de dire « non connecté ».
    try {
      const { checkComposioConnection } = await import("./connect");
      if (await checkComposioConnection(userId, toolkitSlug)) {
        conn = await getUserConnection(userId, toolkitSlug);
      }
    } catch {
      // best-effort
    }
  }
  if (conn) {
    return { connected: true, provider: "composio", accountId: conn.accessToken.slice(0, 12) };
  }

  return { connected: false, provider: "composio", error: `Connectez ${toolkitSlug} d'abord` };
}
