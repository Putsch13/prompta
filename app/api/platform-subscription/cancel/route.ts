import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/platform-subscription/cancel — Annuler Prompta Pro.
 * cancel_at_period_end = true pour garder l'accès jusqu'à la fin de la période.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("platform_subscriptions")
    .select("id, user_id, status, stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "Aucun abonnement Pro actif" }, { status: 404 });
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
      console.error("[cancel-pro] Stripe error", err);
    }
  }

  const { error } = await admin
    .from("platform_subscriptions")
    .update({ status: "canceled" })
    .eq("id", sub.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Prompta Pro annulé en fin de période" });
}
