import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { isComposioEnabled, toComposioToolkitSlug } from "@/lib/composio/client";
import { startComposioAuth } from "@/lib/composio/connect";
import { createSignedState } from "@/lib/connectors/oauth-state";

export const dynamic = "force-dynamic";

const OAUTH_CONFIG: Record<
  string,
  { authUrl: string; scopes: string; clientIdEnv: string; clientSecretEnv: string }
> = {
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  google_sheets: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: "https://www.googleapis.com/auth/spreadsheets",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    scopes: "chat:write,channels:read",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  canva: {
    authUrl: "https://www.canva.com/api/oauth/authorize",
    scopes: "design:content:write",
    clientIdEnv: "CANVA_CLIENT_ID",
    clientSecretEnv: "CANVA_CLIENT_SECRET",
  },
};

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!user) return NextResponse.redirect(new URL("/login", appUrl));

  const connectorId = params.id;

  if (connectorId === "telegram") {
    return NextResponse.redirect(new URL("/dashboard/connexions?connect=telegram", appUrl));
  }

  if (isComposioEnabled()) {
    try {
      const toolkitSlug = toComposioToolkitSlug(connectorId);
      const callbackUrl = `${appUrl}/api/connectors/composio/callback?toolkit=${encodeURIComponent(toolkitSlug)}`;
      const redirectUrl = await startComposioAuth(user.id, toolkitSlug, callbackUrl);
      return NextResponse.redirect(redirectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur Composio";
      return NextResponse.json({ error: message }, { status: 503 });
    }
  }

  const config = OAUTH_CONFIG[connectorId];
  if (!config) {
    return NextResponse.json(
      { error: "Connecteur inconnu — configurez COMPOSIO_API_KEY pour plus d'intégrations" },
      { status: 404 }
    );
  }

  const clientId = process.env[config.clientIdEnv];
  if (!clientId) {
    return NextResponse.json(
      { error: `Configurez ${config.clientIdEnv} ou COMPOSIO_API_KEY` },
      { status: 503 }
    );
  }

  const state = createSignedState({ userId: user.id, connectorId });
  const isProduction = process.env.NODE_ENV === "production";
  cookies().set("oauth_state", state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = `${appUrl}/api/connectors/${connectorId}/callback`;
  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url.toString());
}
