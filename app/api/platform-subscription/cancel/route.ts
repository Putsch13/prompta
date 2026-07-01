import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { subscriptionPeriodEndIso } from "@/lib/stripe/subscription";

export const dynamic = "force-dynamic";

/**
 * POST /api/platform-subscription/cancel — Annuler Prompta Pro.
 * cancel_at_period_end = true pour garder l'accès jusqu'à la fin de la période.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("platform_subscriptions")
    .select("id, user_id, status, stripe_subscription_id, cancel_at_period_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "Aucun abonnement Pro actif" }, { status: 404 });
  }

  if (sub.status === "canceled") {
    return NextResponse.json({ error: "Déjà annulé" }, { status: 400 });
  }

  if (sub.cancel_at_period_end) {
    return NextResponse.json({ error: "Annulation déjà programmée" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let currentPeriodEnd: string | null = null;

  if (sub.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
        expand: ["items.data"],
      });
      currentPeriodEnd = subscriptionPeriodEndIso(updated);
    } catch (err) {
      console.error("[cancel-pro] Stripe error", err);
      return NextResponse.json(
        { error: "Impossible d'annuler l'abonnement Pro Stripe" },
        { status: 502 },
      );
    }
  }

  const { error } = await admin
    .from("platform_subscriptions")
    .update({
      status: "active",
      cancel_at_period_end: true,
      cancel_requested_at: now,
      ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
    })
    .eq("id", sub.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Prompta Pro annulé en fin de période",
    cancel_at_period_end: true,
    current_period_end: currentPeriodEnd,
  });
}
