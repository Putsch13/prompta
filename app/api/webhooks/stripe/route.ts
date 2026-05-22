import { getStripe, computeFees } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = headers().get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const listingId = session.metadata?.listing_id;
      const buyerId = session.metadata?.buyer_id;

      if (!listingId || !buyerId) break;

      const { data: listing } = await admin
        .from("listings")
        .select("price_cents, current_version_id")
        .eq("id", listingId)
        .single();

      if (!listing) break;

      const { platformFeeCents } = computeFees(listing.price_cents);

      await admin.from("purchases").insert({
        buyer_id: buyerId,
        listing_id: listingId,
        version_id: listing.current_version_id,
        amount_cents: listing.price_cents,
        platform_fee_cents: platformFeeCents,
        stripe_payment_intent: session.payment_intent as string,
        status: "completed",
      });

      await admin.from("downloads").insert({
        user_id: buyerId,
        listing_id: listingId,
        version_id: listing.current_version_id,
      });

      break;
    }

    case "account.updated": {
      const account = event.data.object;
      await admin
        .from("stripe_accounts")
        .update({
          charges_enabled: account.charges_enabled ?? false,
          payouts_enabled: account.payouts_enabled ?? false,
        })
        .eq("stripe_account_id", account.id);
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object;
      const pi = charge.payment_intent as string;
      if (pi) {
        await admin
          .from("purchases")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent", pi);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
