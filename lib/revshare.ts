import { createAdminClient } from "@/lib/supabase/admin";
import { PROMPTA_PRO_PRICE_CENTS } from "@/lib/stripe-plans";

/** Part du MRR Pro redistribuée aux builders (reste = marge plateforme). */
export const REVSHARE_POOL_PERCENT = 70;

function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function trackProRun(listingId: string, creatorId: string): Promise<void> {
  const admin = createAdminClient();
  const periodMonth = currentPeriodMonth();

  const { data: existing } = await admin
    .from("platform_pro_usage")
    .select("id, run_count")
    .eq("period_month", periodMonth)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("platform_pro_usage")
      .update({
        run_count: existing.run_count + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("platform_pro_usage").insert({
      period_month: periodMonth,
      listing_id: listingId,
      creator_id: creatorId,
      run_count: 1,
    });
  }
}

export async function calculateMonthlyRevshare(periodMonth?: string): Promise<{
  period: string;
  activeProSubs: number;
  poolCents: number;
  payouts: number;
}> {
  const admin = createAdminClient();
  const period = periodMonth ?? currentPeriodMonth();

  const { count: activeProSubs } = await admin
    .from("platform_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  const subs = activeProSubs ?? 0;
  const grossCents = subs * PROMPTA_PRO_PRICE_CENTS;
  const poolCents = Math.round(grossCents * (REVSHARE_POOL_PERCENT / 100));

  const { data: usageRows } = await admin
    .from("platform_pro_usage")
    .select("listing_id, creator_id, run_count")
    .eq("period_month", period);

  const totalRuns = (usageRows ?? []).reduce((s, r) => s + r.run_count, 0);

  await admin.from("platform_pro_revshare").delete().eq("period_month", period);

  if (totalRuns === 0 || poolCents === 0) {
    return { period, activeProSubs: subs, poolCents, payouts: 0 };
  }

  let payouts = 0;
  for (const row of usageRows ?? []) {
    const amountCents = Math.round((row.run_count / totalRuns) * poolCents);
    if (amountCents <= 0) continue;

    await admin.from("platform_pro_revshare").insert({
      period_month: period,
      creator_id: row.creator_id,
      listing_id: row.listing_id,
      run_count: row.run_count,
      pool_cents: poolCents,
      amount_cents: amountCents,
      status: "pending",
    });
    payouts++;
  }

  return { period, activeProSubs: subs, poolCents, payouts };
}
