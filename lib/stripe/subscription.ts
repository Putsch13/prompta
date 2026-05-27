import type Stripe from "stripe";

function unwrapStripeSubscription(
  subscription: Stripe.Subscription | Stripe.Response<Stripe.Subscription>,
): Stripe.Subscription {
  return subscription as Stripe.Subscription;
}

/** Extrait current_period_end depuis les items (Stripe API 2026+). */
export function subscriptionPeriodEndIso(
  subscription: Stripe.Subscription | Stripe.Response<Stripe.Subscription>,
): string | null {
  const sub = unwrapStripeSubscription(subscription);
  const items = sub.items?.data ?? [];
  let maxEnd: number | null = null;

  for (const item of items) {
    if (typeof item.current_period_end === "number") {
      maxEnd =
        maxEnd === null
          ? item.current_period_end
          : Math.max(maxEnd, item.current_period_end);
    }
  }

  if (maxEnd === null) return null;
  return new Date(maxEnd * 1000).toISOString();
}
