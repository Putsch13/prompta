import { createAdminClient } from "@/lib/supabase/admin";

export async function hasPlatformPro(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_subscriptions")
    .select("status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return !!data;
}

export interface SellPaidStatus {
  canSell: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

/** Garde-fou Stripe : vente payante uniquement si KYC complet. */
export async function canSellPaid(userId: string): Promise<SellPaidStatus> {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("stripe_accounts")
    .select("charges_enabled, payouts_enabled")
    .eq("profile_id", userId)
    .maybeSingle();

  const chargesEnabled = account?.charges_enabled === true;
  const payoutsEnabled = account?.payouts_enabled === true;

  return {
    canSell: chargesEnabled && payoutsEnabled,
    chargesEnabled,
    payoutsEnabled,
  };
}
