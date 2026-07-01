import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { creatorNetCents } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: listings } = await admin
    .from("listings")
    .select("id, subscription_price_cents")
    .eq("creator_id", user.id);

  const listingIds = (listings ?? []).map((l) => l.id);
  const priceMap = (listings ?? []).reduce<Record<string, number>>((acc, l) => {
    acc[l.id] = l.subscription_price_cents ?? 0;
    return acc;
  }, {});

  if (listingIds.length === 0) {
    const periodMonth = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`;
    const { data: proUsage } = await admin
      .from("platform_pro_usage")
      .select("run_count")
      .eq("creator_id", user.id)
      .eq("period_month", periodMonth);
    const proRunsThisMonth = (proUsage ?? []).reduce((s, r) => s + r.run_count, 0);
    const { data: proRevshare } = await admin
      .from("platform_pro_revshare")
      .select("amount_cents")
      .eq("creator_id", user.id)
      .eq("period_month", periodMonth);
    const proRevshareCents = (proRevshare ?? []).reduce((s, r) => s + r.amount_cents, 0);
    return NextResponse.json({
      mrrCents: 0,
      activeSubs: 0,
      proRevshareCents,
      proRunsThisMonth,
    });
  }

  const { data: subs } = await admin
    .from("subscriptions")
    .select("listing_id")
    .in("listing_id", listingIds)
    .eq("status", "active");

  const activeSubs = subs?.length ?? 0;
  const mrrCents = (subs ?? []).reduce((sum, s) => {
    const price = priceMap[s.listing_id] ?? 0;
    return sum + creatorNetCents(price);
  }, 0);

  const periodMonth = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`;

  const { data: proUsage } = await admin
    .from("platform_pro_usage")
    .select("run_count")
    .eq("creator_id", user.id)
    .eq("period_month", periodMonth);

  const proRunsThisMonth = (proUsage ?? []).reduce((s, r) => s + r.run_count, 0);

  const { data: proRevshare } = await admin
    .from("platform_pro_revshare")
    .select("amount_cents")
    .eq("creator_id", user.id)
    .eq("period_month", periodMonth);

  const proRevshareCents = (proRevshare ?? []).reduce((s, r) => s + r.amount_cents, 0);

  return NextResponse.json({ mrrCents, activeSubs, proRevshareCents, proRunsThisMonth });
}
