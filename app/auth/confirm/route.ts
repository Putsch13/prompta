import { createClient } from "@/lib/supabase/server";
import { grantWelcomeCredits } from "@/lib/billing/entitlements";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "signup" | "email";
  const redirect = searchParams.get("redirect") || "/onboarding";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      // Inscription par email : mêmes 2 € + email de bienvenue qu'en OAuth.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const firstGrant = await grantWelcomeCredits(user.id);
        if (firstGrant && user.email) {
          const { sendWelcomeEmail } = await import("@/lib/email");
          void sendWelcomeEmail({ to: user.email });
        }
      }
      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
