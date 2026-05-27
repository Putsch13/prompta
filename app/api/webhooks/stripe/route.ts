import { getStripe, computeFees } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ORG_PLANS, type OrgPlanKey } from "@/lib/stripe-plans";

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
      const sessionType = session.metadata?.type;

      if (sessionType === "credits") {
        const buyerId = session.metadata?.buyer_id;
        const creditsCents = parseInt(session.metadata?.credits_cents ?? "0", 10);
        if (buyerId && creditsCents > 0) {
          const { addCredits } = await import("@/lib/credits");
          await addCredits(
            buyerId,
            creditsCents,
            "purchase",
            "Achat pack crédits",
            session.id
          );
        }
        break;
      }

      if (sessionType === "platform_pro") {
        const buyerId = session.metadata?.buyer_id;
        const subId = session.subscription as string | null;
        if (buyerId && subId) {
          await admin.from("platform_subscriptions").upsert(
            {
              user_id: buyerId,
              stripe_subscription_id: subId,
              plan: "pro",
              status: "active",
            },
            { onConflict: "user_id" }
          );
        }
        break;
      }

      if (sessionType === "org_subscription") {
        const orgId = session.metadata?.org_id;
        const plan = session.metadata?.plan;
        const subId = session.subscription as string | null;
        if (orgId && subId) {
          const planConfig = plan ? ORG_PLANS[plan as OrgPlanKey] : null;
          await admin
            .from("organizations")
            .update({
              stripe_subscription_id: subId,
              subscription_status: "active",
              plan: plan ?? "starter",
              seat_limit: planConfig?.seats ?? 10,
            })
            .eq("id", orgId);
        }
        break;
      }

      const listingId = session.metadata?.listing_id;
      const buyerId = session.metadata?.buyer_id;

      if (!listingId || !buyerId) break;

      const { data: listing } = await admin
        .from("listings")
        .select("price_cents, current_version_id, title, slug, type")
        .eq("id", listingId)
        .single();

      if (!listing) break;

      const { platformFeeCents } = computeFees(listing.price_cents);

      const taxCents = session.total_details?.amount_tax ?? 0;

      const { data: purchase } = await admin
        .from("purchases")
        .insert({
          buyer_id: buyerId,
          listing_id: listingId,
          version_id: listing.current_version_id,
          amount_cents: listing.price_cents,
          platform_fee_cents: platformFeeCents,
          tax_cents: taxCents,
          stripe_payment_intent: session.payment_intent as string,
          stripe_checkout_session: session.id,
          status: "completed",
        })
        .select("id")
        .single();

      if (listing.type === "prompt") {
        await admin.from("downloads").insert({
          user_id: buyerId,
          listing_id: listingId,
          version_id: listing.current_version_id,
        });
      }

      const { data: userData } = await admin.auth.admin.getUserById(buyerId);
      const buyerEmail = userData?.user?.email;
      const buyerName = userData?.user?.user_metadata?.display_name || buyerEmail?.split("@")[0] || "Un utilisateur";

      if (buyerEmail && purchase) {
        const { sendPurchaseReceipt, sendSaleNotification } = await import("@/lib/email");
        await sendPurchaseReceipt({
          to: buyerEmail,
          listingTitle: listing.title,
          listingSlug: listing.slug,
          listingType: listing.type,
          amountCents: listing.price_cents,
          taxCents,
          purchaseId: purchase.id,
          versionId: listing.current_version_id || "",
        });

        const { data: listingFull } = await admin
          .from("listings")
          .select("creator_id")
          .eq("id", listingId)
          .single();

        if (listingFull?.creator_id) {
          const { data: creatorData } = await admin.auth.admin.getUserById(listingFull.creator_id);
          const creatorEmail = creatorData?.user?.email;

          if (creatorEmail) {
            await sendSaleNotification({
              to: creatorEmail,
              listingTitle: listing.title,
              amountCents: listing.price_cents,
              platformFeeCents,
              buyerName,
            });
          }
        }
      }

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

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as unknown as {
        id: string;
        status: string;
        customer: string;
        current_period_end: number;
        cancel_at_period_end?: boolean;
        metadata?: {
          listing_id?: string;
          buyer_id?: string;
          type?: string;
          org_id?: string;
          plan?: string;
        };
      };

      const isDeleted = event.type === "customer.subscription.deleted";
      const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
      const cancelAtPeriodEnd = isDeleted ? false : Boolean(subscription.cancel_at_period_end);
      const localStatus = isDeleted ? "canceled" : subscription.status;

      if (subscription.metadata?.type === "platform_pro") {
        const buyerId = subscription.metadata.buyer_id;
        if (buyerId) {
          await admin.from("platform_subscriptions").upsert(
            {
              user_id: buyerId,
              stripe_subscription_id: subscription.id,
              plan: "pro",
              status: localStatus,
              cancel_at_period_end: cancelAtPeriodEnd,
              current_period_end: periodEnd,
            },
            { onConflict: "user_id" }
          );
        }
        break;
      }

      if (subscription.metadata?.type === "org_subscription") {
        const orgId = subscription.metadata.org_id;
        if (orgId) {
          await admin
            .from("organizations")
            .update({
              subscription_status: subscription.status === "active" ? "active" : subscription.status,
              stripe_subscription_id: subscription.id,
            })
            .eq("id", orgId);
        }
        break;
      }

      const listingId = subscription.metadata?.listing_id;
      const buyerId = subscription.metadata?.buyer_id;

      if (listingId && buyerId) {
        const { data: listing } = await admin
          .from("listings")
          .select("current_version_id")
          .eq("id", listingId)
          .maybeSingle();

        await admin.from("subscriptions").upsert(
          {
            user_id: buyerId,
            listing_id: listingId,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: subscription.customer,
            status: localStatus,
            cancel_at_period_end: cancelAtPeriodEnd,
            pinned_version_id: listing?.current_version_id ?? null,
            current_period_end: periodEnd,
          },
          { onConflict: "user_id,listing_id" }
        );
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as {
        subscription?: string | null;
        customer_email?: string | null;
        amount_paid?: number;
      };
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        await admin
          .from("subscriptions")
          .update({ status: "active" })
          .eq("stripe_subscription_id", subscriptionId);

        const { data: sub } = await admin
          .from("subscriptions")
          .select("user_id, listing_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (sub?.listing_id && invoice.customer_email) {
          const { data: listing } = await admin
            .from("listings")
            .select("title, subscription_price_cents")
            .eq("id", sub.listing_id)
            .single();

          if (listing) {
            const { sendSubscriptionConfirmation } = await import("@/lib/email");
            await sendSubscriptionConfirmation({
              to: invoice.customer_email,
              listingTitle: listing.title,
              amountCents: listing.subscription_price_cents ?? invoice.amount_paid ?? 0,
            });
          }
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as { subscription?: string | null };
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        await admin
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
