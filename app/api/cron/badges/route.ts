import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: badges } = await supabase
    .from("badges")
    .select("id, slug");

  if (!badges || badges.length === 0) {
    return NextResponse.json({ message: "No badges found" });
  }

  const badgeMap = new Map(badges.map((b) => [b.slug, b.id]));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, is_verified");

  if (!profiles) {
    return NextResponse.json({ message: "No profiles found" });
  }

  let badgesAwarded = 0;

  for (const profile of profiles) {
    const { data: listings } = await supabase
      .from("listings")
      .select("id")
      .eq("creator_id", profile.id)
      .eq("status", "published");

    const listingIds = (listings || []).map((l) => l.id);

    const { count: totalDownloads } = listingIds.length > 0
      ? await supabase
          .from("downloads")
          .select("*", { count: "exact", head: true })
          .in("listing_id", listingIds)
      : { count: 0 };

    const downloads = totalDownloads || 0;

    const badgesToAward: string[] = [];

    if (profile.is_verified && badgeMap.has("verified")) {
      badgesToAward.push(badgeMap.get("verified")!);
    }

    if (downloads >= 1000 && badgeMap.has("downloads_1k")) {
      badgesToAward.push(badgeMap.get("downloads_1k")!);
    }

    if (downloads >= 10000 && badgeMap.has("downloads_10k")) {
      badgesToAward.push(badgeMap.get("downloads_10k")!);
    }

    if (downloads >= 100000 && badgeMap.has("downloads_100k")) {
      badgesToAward.push(badgeMap.get("downloads_100k")!);
    }

    for (const badgeId of badgesToAward) {
      const { error } = await supabase
        .from("creator_badges")
        .upsert(
          {
            creator_id: profile.id,
            badge_id: badgeId,
            awarded_at: new Date().toISOString(),
          },
          {
            onConflict: "creator_id,badge_id",
          }
        );

      if (!error) {
        badgesAwarded++;
      }
    }
  }

  return NextResponse.json({
    message: "Badges recalculated",
    badgesAwarded,
    profilesProcessed: profiles.length,
  });
}
