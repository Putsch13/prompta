import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { saveUserConnection } from "@/lib/connections";

export const dynamic = "force-dynamic";

const TOKEN_URL: Record<string, { url: string; clientIdEnv: string; clientSecretEnv: string }> = {
  gmail: {
    url: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  google_sheets: {
    url: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  slack: {
    url: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  canva: {
    url: "https://api.canva.com/rest/v1/oauth/token",
    clientIdEnv: "CANVA_CLIENT_ID",
    clientSecretEnv: "CANVA_CLIENT_SECRET",
  },
};

interface Params {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: Params) {
  const connectorId = params.id;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = cookies().get("oauth_state")?.value;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const failRedirect = `${appUrl}/dashboard/connexions?error=oauth`;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(failRedirect);
  }

  let parsed: { userId: string; connectorId: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.redirect(failRedirect);
  }

  const tokenConfig = TOKEN_URL[connectorId];
  if (!tokenConfig) return NextResponse.redirect(failRedirect);

  const clientId = process.env[tokenConfig.clientIdEnv];
  const clientSecret = process.env[tokenConfig.clientSecretEnv];
  if (!clientId || !clientSecret) return NextResponse.redirect(failRedirect);

  const redirectUri = `${appUrl}/api/connectors/${connectorId}/callback`;

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(tokenConfig.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token ?? tokenData.authed_user?.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in;

  if (!accessToken) return NextResponse.redirect(failRedirect);

  await saveUserConnection(parsed.userId, connectorId, {
    accessToken,
    refreshToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scopes: (tokenData.scope ?? "").split(" ").filter(Boolean),
  });

  cookies().delete("oauth_state");
  return NextResponse.redirect(`${appUrl}/dashboard/connexions?connected=${connectorId}`);
}
