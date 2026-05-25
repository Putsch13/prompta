import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { listingId } = await request.json();
  const admin = createAdminClient();

  const { data: listing } = await admin
    .from("listings")
    .select("id, title, slug, creator_id, subscription_price_cents, pricing_mode")
    .eq("id", listingId)
    .eq("status", "published")
    .single();

  if (!listing || listing.pricing_mode !== "subscription") {
    return NextResponse.json({ error: "Agent non disponible en abonnement" }, { status: 400 });
  }

  const { data: stripeAccount } = await admin
    .from("stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("profile_id", listing.creator_id)
    .single();

  if (!stripeAccount?.charges_enabled || !stripeAccount?.payouts_enabled) {
    return NextResponse.json({ error: "Créateur non vérifié KYC" }, { status: 400 });
  }

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const priceCents = listing.subscription_price_cents || 990;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: listing.title },
          unit_amount: priceCents,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      application_fee_percent: 20,
      transfer_data: { destination: stripeAccount.stripe_account_id },
      metadata: { listing_id: listingId, buyer_id: user.id },
    },
    automatic_tax: { enabled: true },
    success_url: `${appUrl}/dashboard/abonnements?success=1`,
    cancel_url: `${appUrl}/listing/${listing.slug}`,
    metadata: { listing_id: listingId, buyer_id: user.id, type: "subscription" },
  });

  return NextResponse.json({ url: session.url });
}
