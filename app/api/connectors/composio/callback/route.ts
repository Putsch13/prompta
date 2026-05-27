import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleComposioCallback } from "@/lib/composio/connect";
import { isComposioEnabled } from "@/lib/composio/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const failRedirect = `${appUrl}/dashboard/connexions?error=oauth`;

  if (!isComposioEnabled()) {
    return NextResponse.redirect(failRedirect);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/login`);

  const status = req.nextUrl.searchParams.get("status") ?? "failed";
  const connectedAccountId =
    req.nextUrl.searchParams.get("connected_account_id") ??
    req.nextUrl.searchParams.get("connectedAccountId");
  const toolkit =
    req.nextUrl.searchParams.get("toolkit") ??
    req.nextUrl.searchParams.get("appName") ??
    "";

  if (status !== "success" || !connectedAccountId || !toolkit) {
    return NextResponse.redirect(failRedirect);
  }

  try {
    await handleComposioCallback(user.id, toolkit, connectedAccountId, status);
    const returnUrl = req.nextUrl.searchParams.get("returnUrl");
    const appBase = appUrl.replace(/\/$/, "");
    if (returnUrl && returnUrl.startsWith(appBase)) {
      const sep = returnUrl.includes("?") ? "&" : "?";
      return NextResponse.redirect(`${returnUrl}${sep}connected=${toolkit}`);
    }
    return NextResponse.redirect(`${appUrl}/dashboard/connexions?connected=${toolkit}`);
  } catch {
    return NextResponse.redirect(failRedirect);
  }
}
