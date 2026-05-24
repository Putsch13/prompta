import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, computeFees } from "@/lib/stripe";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { listingId } = await request.json();
  if (!listingId) {
    return NextResponse.json({ error: "listingId requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: listing } = await admin
    .from("listings")
    .select("id, title, price_cents, currency, creator_id, current_version_id, status")
    .eq("id", listingId)
    .single();

  if (!listing || listing.status !== "published") {
    return NextResponse.json({ error: "Listing introuvable" }, { status: 404 });
  }

  if (listing.price_cents === 0) {
    return NextResponse.json({ error: "Ce listing est gratuit" }, { status: 400 });
  }

  if (listing.creator_id === user.id) {
    return NextResponse.json({ error: "Tu ne peux pas acheter ton propre listing" }, { status: 400 });
  }

  const { data: alreadyPurchased } = await admin
    .from("purchases")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("listing_id", listingId)
    .eq("status", "completed")
    .single();

  if (alreadyPurchased) {
    return NextResponse.json({ error: "Déjà acheté" }, { status: 400 });
  }

  const { data: stripeAccount } = await admin
    .from("stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("profile_id", listing.creator_id)
    .single();

  if (!stripeAccount?.charges_enabled || !stripeAccount?.payouts_enabled) {
    return NextResponse.json(
      { error: "Le créateur n'a pas complété sa vérification KYC" },
      { status: 400 }
    );
  }

  const { platformFeeCents } = computeFees(listing.price_cents);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: listing.currency,
          product_data: { name: listing.title },
          unit_amount: listing.price_cents,
          tax_behavior: "exclusive",
        },
        quantity: 1,
      },
    ],
    automatic_tax: { enabled: true },
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: stripeAccount.stripe_account_id,
      },
      metadata: {
        listing_id: listing.id,
        buyer_id: user.id,
        version_id: listing.current_version_id || "",
      },
    },
    success_url: `${appUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/listing/${listing.id}`,
    metadata: {
      listing_id: listing.id,
      buyer_id: user.id,
    },
  });

  return NextResponse.json({ url: session.url });
}
