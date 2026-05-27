import { createAdminClient } from "@/lib/supabase/admin";

export type LibrarySource = "created" | "purchased" | "subscribed";

export interface LibraryListing {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string | null;
  price_cents: number;
  subscription_price_cents: number;
  pricing_mode: string;
  hosting_fee_cents: number;
  provisioning_mode: string;
  updated_at: string;
  source: LibrarySource;
  acquired_at?: string;
}

type ListingRow = {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string | null;
  price_cents: number;
  subscription_price_cents: number;
  pricing_mode: string;
  hosting_fee_cents?: number | null;
  provisioning_mode?: string | null;
  updated_at: string;
};

const BASE_SELECT =
  "id, title, slug, type, status, price_cents, subscription_price_cents, pricing_mode, updated_at";

function mapListing(
  l: ListingRow,
  source: LibrarySource,
  acquired_at?: string,
  extras?: { hosting_fee_cents?: number | null; provisioning_mode?: string | null }
): LibraryListing {
  return {
    ...l,
    hosting_fee_cents: extras?.hosting_fee_cents ?? l.hosting_fee_cents ?? 0,
    provisioning_mode: extras?.provisioning_mode ?? l.provisioning_mode ?? "manual",
    source,
    acquired_at,
  };
}

export async function fetchUserLibrary(userId: string): Promise<{
  created: LibraryListing[];
  purchased: LibraryListing[];
  subscribed: LibraryListing[];
}> {
  const admin = createAdminClient();

  const { data: createdRaw } = await admin
    .from("listings")
    .select(BASE_SELECT)
    .eq("creator_id", userId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .neq("status", "deleted" as any)
    .order("updated_at", { ascending: false });

  // Colonnes optionnelles (migration 0031) — requête séparée si présentes
  let hostingMap: Record<string, { hosting_fee_cents: number; provisioning_mode: string }> = {};
  const { data: hostingRows, error: hostingErr } = await admin
    .from("listings")
    .select("id, hosting_fee_cents, provisioning_mode")
    .eq("creator_id", userId);

  if (!hostingErr && hostingRows) {
    hostingMap = Object.fromEntries(
      (hostingRows as unknown as { id: string; hosting_fee_cents?: number; provisioning_mode?: string }[]).map(
        (r) => [
          r.id,
          {
            hosting_fee_cents: r.hosting_fee_cents ?? 0,
            provisioning_mode: r.provisioning_mode ?? "manual",
          },
        ]
      )
    );
  }

  const created = ((createdRaw ?? []) as ListingRow[]).map((l) =>
    mapListing(l, "created", undefined, hostingMap[l.id])
  );

  const { data: purchasesRaw } = await admin
    .from("purchases")
    .select(`created_at, listing:listings(${BASE_SELECT})`)
    .eq("buyer_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  const purchased: LibraryListing[] = [];
  for (const row of purchasesRaw ?? []) {
    const r = row as { created_at: string; listing: ListingRow | null };
    if (!r.listing) continue;
    purchased.push(mapListing(r.listing, "purchased", r.created_at));
  }

  const { data: subsRaw } = await admin
    .from("subscriptions")
    .select(`created_at, listing:listings(${BASE_SELECT})`)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const subscribed: LibraryListing[] = [];
  for (const row of subsRaw ?? []) {
    const r = row as { created_at: string; listing: ListingRow | null };
    if (!r.listing) continue;
    subscribed.push(mapListing(r.listing, "subscribed", r.created_at));
  }

  return { created, purchased, subscribed };
}
