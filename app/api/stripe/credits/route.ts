import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { CREDIT_PACKS } from "@/lib/credit-packs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { packId } = await request.json();
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return NextResponse.json({ error: "Pack invalide" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: `Crédits Prompta — ${pack.label}` },
          unit_amount: pack.amountCents,
        },
        quantity: 1,
      },
    ],
    automatic_tax: { enabled: true },
    success_url: `${appUrl}/dashboard/credits?success=1`,
    cancel_url: `${appUrl}/dashboard/credits`,
    metadata: {
      type: "credits",
      buyer_id: user.id,
      credits_cents: String(pack.creditsCents),
    },
  });

  return NextResponse.json({ url: session.url });
}
