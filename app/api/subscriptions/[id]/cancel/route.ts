import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/subscriptions/:id/cancel — Annuler un abonnement agent.
 * Utilise cancel_at_period_end pour ne pas couper immédiatement.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, status, stripe_subscription_id")
    .eq("id", id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });
  }

  if (sub.user_id !== user.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  if (sub.status === "canceled") {
    return NextResponse.json({ error: "Déjà annulé" }, { status: 400 });
  }

  if (sub.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    } catch (err) {
      console.error("[cancel-sub] Stripe error", err);
    }
  }

  const { error } = await admin
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Abonnement annulé en fin de période" });
}
