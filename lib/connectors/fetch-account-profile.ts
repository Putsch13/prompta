export interface ConnectionAccountProfile {
  accountEmail?: string | null;
  accountName?: string | null;
  workspaceName?: string | null;
}

/** Récupère le profil compte depuis le token OAuth natif. */
export async function fetchNativeAccountProfile(
  connectorId: string,
  accessToken: string,
  oauthPayload?: Record<string, unknown>,
): Promise<ConnectionAccountProfile> {
  if (connectorId === "gmail" || connectorId === "google_sheets") {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return {};
      const data = (await res.json()) as { email?: string; name?: string };
      return { accountEmail: data.email ?? null, accountName: data.name ?? null };
    } catch {
      return {};
    }
  }

  if (connectorId === "slack") {
    const team = oauthPayload?.team as { name?: string } | undefined;
    const authedUser = oauthPayload?.authed_user as { id?: string } | undefined;
    try {
      const res = await fetch("https://slack.com/api/auth.test", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        user?: string;
        team?: string;
      };
      if (data.ok) {
        return {
          accountName: data.user ?? authedUser?.id ?? null,
          workspaceName: data.team ?? team?.name ?? null,
        };
      }
    } catch {
      // fallback payload OAuth
    }
    return { workspaceName: team?.name ?? null };
  }

  return {};
}

/** Extrait un libellé depuis une connected account Composio. */
export function profileFromComposioAccount(account: {
  alias?: string | null;
  word_id?: string | null;
  data?: Record<string, unknown>;
}): ConnectionAccountProfile {
  const data = account.data ?? {};
  const email =
    (typeof data.email === "string" && data.email) ||
    (typeof data.user_email === "string" && data.user_email) ||
    (typeof data.account_email === "string" && data.account_email) ||
    null;
  const name =
    (typeof data.name === "string" && data.name) ||
    (typeof data.user_name === "string" && data.user_name) ||
    account.alias ||
    null;
  const workspace =
    (typeof data.team_name === "string" && data.team_name) ||
    (typeof data.workspace_name === "string" && data.workspace_name) ||
    account.word_id ||
    null;

  return {
    accountEmail: email,
    accountName: name,
    workspaceName: workspace,
  };
}
