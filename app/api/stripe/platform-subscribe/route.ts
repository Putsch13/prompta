import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { PLANS, type PlanId } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

/** Démarre l'abonnement à un plan Prompta (Starter / Pro / Scale). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { plan?: string };
  // Compat : l'ancien bouton « Prompta Pro » sans body → starter.
  const planId = (body.plan ?? "starter") as PlanId;
  const plan = PLANS[planId];
  if (!plan || plan.priceCents <= 0) {
    return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const stripe = getStripe();

  // Changement de plan : un abonnement actif existe déjà → on le MET À JOUR
  // (proration immédiate) au lieu d'ouvrir un 2ᵉ checkout qui créerait un
  // double abonnement facturé en parallèle.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("platform_subscriptions")
    .select("stripe_subscription_id, plan, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.stripe_subscription_id && existing.status === "active") {
    if (existing.plan === plan.id) {
      return NextResponse.json({
        url: `${appUrl}/dashboard/abonnements?plan=${plan.id}`,
      });
    }
    try {
      const sub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
      if (["active", "trialing", "past_due"].includes(sub.status)) {
        await stripe.subscriptions.update(sub.id, {
          items: [
            {
              id: sub.items.data[0].id,
              price_data: {
                currency: "eur",
                product: sub.items.data[0].price.product as string,
                unit_amount: plan.priceCents,
                recurring: { interval: "month" },
              },
            },
          ],
          proration_behavior: "always_invoice",
          cancel_at_period_end: false,
          metadata: { type: "platform_plan", buyer_id: user.id, plan: plan.id },
        });
        await admin
          .from("platform_subscriptions")
          .update({ plan: plan.id, cancel_at_period_end: false })
          .eq("user_id", user.id);
        return NextResponse.json({
          url: `${appUrl}/dashboard/abonnements?plan=${plan.id}&changed=1`,
        });
      }
    } catch (e) {
      // Abonnement Stripe introuvable/résilié → nouveau checkout classique.
      console.warn("[platform-subscribe] plan change fallback to checkout:", e);
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Prompta ${plan.label}`,
            description: plan.tagline,
          },
          unit_amount: plan.priceCents,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    automatic_tax: { enabled: true },
    success_url: `${appUrl}/dashboard/abonnements?plan=${plan.id}`,
    cancel_url: `${appUrl}/pricing`,
    metadata: { type: "platform_plan", buyer_id: user.id, plan: plan.id },
    subscription_data: {
      metadata: { type: "platform_plan", buyer_id: user.id, plan: plan.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
