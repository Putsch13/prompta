import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Id d'abonnement d'une facture — API Stripe 2026 : le champ racine
 * `invoice.subscription` a disparu au profit de
 * `invoice.parent.subscription_details.subscription`. Fallback legacy inclus.
 */
function invoiceSubscriptionId(invoice: unknown): string | null {
  const inv = invoice as {
    subscription?: string | { id?: string } | null;
    parent?: {
      subscription_details?: { subscription?: string | { id?: string } | null } | null;
    } | null;
  };
  const raw = inv.parent?.subscription_details?.subscription ?? inv.subscription ?? null;
  if (!raw) return null;
  return typeof raw === "string" ? raw : (raw.id ?? null);
}

/**
 * Fin de période d'un abonnement — API 2026 : `current_period_end` vit sur les
 * items, plus à la racine. new Date(undefined) lèverait un RangeError qui
 * faisait 500 tout le webhook (résiliations jamais persistées).
 */
function subscriptionPeriodEndIsoFromEvent(subscription: {
  current_period_end?: number;
  items?: { data?: Array<{ current_period_end?: number }> };
}): string | null {
  let maxEnd = typeof subscription.current_period_end === "number"
    ? subscription.current_period_end
    : null;
  for (const item of subscription.items?.data ?? []) {
    if (typeof item.current_period_end === "number") {
      maxEnd = maxEnd === null ? item.current_period_end : Math.max(maxEnd, item.current_period_end);
    }
  }
  return maxEnd === null ? null : new Date(maxEnd * 1000).toISOString();
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = (await headers()).get("stripe-signature");

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

      if (sessionType === "platform_pro" || sessionType === "platform_plan") {
        const buyerId = session.metadata?.buyer_id;
        const subId = session.subscription as string | null;
        const planId = session.metadata?.plan ?? "starter";
        if (buyerId && subId) {
          await admin.from("platform_subscriptions").upsert(
            {
              user_id: buyerId,
              stripe_subscription_id: subId,
              plan: planId,
              status: "active",
            },
            { onConflict: "user_id" }
          );
          // Les crédits mensuels inclus sont accordés via invoice.paid
          // (idempotent par facture), première échéance comprise.
        }
        break;
      }

      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as unknown as {
        id: string;
        status: string;
        customer: string;
        current_period_end?: number;
        items?: { data?: Array<{ current_period_end?: number }> };
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
      const periodEnd = subscriptionPeriodEndIsoFromEvent(subscription);
      const cancelAtPeriodEnd = isDeleted ? false : Boolean(subscription.cancel_at_period_end);
      const localStatus = isDeleted ? "canceled" : subscription.status;

      if (
        subscription.metadata?.type === "platform_pro" ||
        subscription.metadata?.type === "platform_plan"
      ) {
        const buyerId = subscription.metadata.buyer_id;
        if (buyerId) {
          await admin.from("platform_subscriptions").upsert(
            {
              user_id: buyerId,
              stripe_subscription_id: subscription.id,
              plan: subscription.metadata.plan ?? "starter",
              status: localStatus,
              cancel_at_period_end: cancelAtPeriodEnd,
              current_period_end: periodEnd,
            },
            { onConflict: "user_id" }
          );
        }
        break;
      }

      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as {
        customer_email?: string | null;
        amount_paid?: number;
      };
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        // ── Plan Prompta : crédits IA mensuels inclus (idempotent/facture) ──
        const { data: platformSub } = await admin
          .from("platform_subscriptions")
          .select("user_id, plan")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (platformSub?.user_id) {
          // Sans invoice.id, un fallback horodaté casserait l'idempotence
          // (chaque retry Stripe re-créditerait) : on saute le grant, Stripe
          // rejouera l'événement avec l'id présent.
          const invoiceId = (invoice as { id?: string }).id;
          if (invoiceId) {
            const { grantPlanMonthlyCredits } = await import("@/lib/billing/entitlements");
            // amount_paid borne le grant (com ≥ 20 % même sur facture legacy/prorata).
            await grantPlanMonthlyCredits(
              platformSub.user_id,
              platformSub.plan,
              invoiceId,
              invoice.amount_paid,
            ).catch(
              (e) => console.error("[webhook] plan credit grant failed:", e),
            );
          } else {
            console.error("[webhook] invoice.paid sans id — grant crédits plan sauté");
          }
          await admin
            .from("platform_subscriptions")
            .update({ status: "active" })
            .eq("stripe_subscription_id", subscriptionId);
          break;
        }

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
      const subscriptionId = invoiceSubscriptionId(event.data.object);
      if (subscriptionId) {
        await admin
          .from("platform_subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);
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
