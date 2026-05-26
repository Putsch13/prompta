import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

export const PLATFORM_COMMISSION_PERCENT = 20;
export const SUBSCRIPTION_COMMISSION_PERCENT = PLATFORM_COMMISSION_PERCENT;

export function computeFees(amountCents: number) {
  const platformFeeCents = Math.round(amountCents * (PLATFORM_COMMISSION_PERCENT / 100));
  return { platformFeeCents };
}

export function creatorNetCents(priceCents: number): number {
  const { platformFeeCents } = computeFees(priceCents);
  return priceCents - platformFeeCents;
}
