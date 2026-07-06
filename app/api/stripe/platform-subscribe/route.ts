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
