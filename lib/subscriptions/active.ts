/** Abonnement encore actif côté accès (payé jusqu'à current_period_end). */
export function isSubscriptionAccessActive(sub: {
  status: string;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
}): boolean {
  if (sub.status === "active" || sub.status === "trialing") {
    return true;
  }

  if (sub.cancel_at_period_end && sub.current_period_end) {
    return new Date(sub.current_period_end).getTime() > Date.now();
  }

  return false;
}
