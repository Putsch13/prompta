import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreditBalance } from "@/lib/credits";
import { grantWelcomeCredits } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let balanceCents = await getCreditBalance(user.id);
  if (balanceCents === 0) {
    // Filet de sécurité : comptes créés avant le grant au callback d'auth
    // (idempotent — la clé welcome_<userId> bloque tout doublon).
    await grantWelcomeCredits(user.id);
    balanceCents = await getCreditBalance(user.id);
  }
  return NextResponse.json({ balanceCents });
}
