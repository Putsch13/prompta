import { createClient } from "@/lib/supabase/server";
import { grantWelcomeCredits } from "@/lib/billing/entitlements";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") || "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // 2 € de bienvenue dès la première connexion (idempotent) — sans
        // attendre la première visite du dashboard, promesse de la landing.
        // Premier octroi → email de bienvenue (une seule fois, best-effort).
        const firstGrant = await grantWelcomeCredits(user.id);
        if (firstGrant && user.email) {
          const { sendWelcomeEmail } = await import("@/lib/email");
          void sendWelcomeEmail({
            to: user.email,
            displayName: (user.user_metadata?.display_name as string | undefined) ?? undefined,
          });
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        if (!profile) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
