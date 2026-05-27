import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { subscriptionPeriodEndIso } from "@/lib/stripe/subscription";

export const dynamic = "force-dynamic";

/**
 * POST /api/subscriptions/:id/cancel — Annuler un abonnement agent.
 * Utilise cancel_at_period_end pour ne pas couper immédiatement.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
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
    .select("id, user_id, status, stripe_subscription_id, cancel_at_period_end")
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
      console.error("[cancel-sub] Stripe error", err);
      return NextResponse.json(
        { error: "Impossible d'annuler l'abonnement Stripe" },
        { status: 502 },
      );
    }
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      cancel_at_period_end: true,
      cancel_requested_at: now,
      ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Abonnement annulé en fin de période",
    cancel_at_period_end: true,
    current_period_end: currentPeriodEnd,
  });
}
