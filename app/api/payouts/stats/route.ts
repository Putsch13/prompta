import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
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
    return NextResponse.json({ mrrCents: 0, activeSubs: 0 });
  }

  const { data: subs } = await admin
    .from("subscriptions")
    .select("listing_id")
    .in("listing_id", listingIds)
    .eq("status", "active");

  const activeSubs = subs?.length ?? 0;
  const mrrCents = (subs ?? []).reduce((sum, s) => {
    const price = priceMap[s.listing_id] ?? 0;
    return sum + Math.round(price * 0.8);
  }, 0);

  return NextResponse.json({ mrrCents, activeSubs });
}
