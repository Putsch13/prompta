import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { PROMPTA_PRO_PRICE_CENTS } from "@/lib/stripe-plans";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
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
          product_data: { name: "Prompta Pro — Accès catalogue" },
          unit_amount: PROMPTA_PRO_PRICE_CENTS,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    automatic_tax: { enabled: true },
    success_url: `${appUrl}/dashboard/abonnements?pro=1`,
    cancel_url: `${appUrl}/dashboard/abonnements`,
    metadata: { type: "platform_pro", buyer_id: user.id },
    subscription_data: {
      metadata: { type: "platform_pro", buyer_id: user.id },
    },
  });

  return NextResponse.json({ url: session.url });
}
