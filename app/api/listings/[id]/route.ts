import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { isSubscriptionAccessActive } from "@/lib/subscriptions/active";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/listings/:id — Soft-delete un listing.
 * - Vérifie que l'user est le créateur.
 * - Refuse si abonnements actifs existent.
 * - Passe status = "deleted" (jamais de hard delete).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: listing } = await admin
    .from("listings")
    .select("id, creator_id, status, slug, title")
    .eq("id", id)
    .maybeSingle();

  if (!listing) {
    return NextResponse.json({ error: "Listing introuvable" }, { status: 404 });
  }

  if (listing.creator_id !== user.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  if ((listing.status as string) === "deleted") {
    return NextResponse.json({ error: "Déjà supprimé" }, { status: 400 });
  }

  const { data: subs } = await admin
    .from("subscriptions")
    .select("status, cancel_at_period_end, current_period_end")
    .eq("listing_id", id);

  const hasActiveSubs = (subs ?? []).some((sub) =>
    isSubscriptionAccessActive(sub),
  );

  if (hasActiveSubs) {
    return NextResponse.json(
      {
        error: "Impossible de supprimer : des abonnés actifs existent. Désactivez d'abord l'agent.",
      },
      { status: 409 },
    );
  }

  const suffix = `deleted-${Date.now()}`;
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await admin
    .from("listings")
    .update({
      status: "deleted",
      slug: `${listing.slug}-${suffix}`.slice(0, 180),
      title: `${listing.title} (supprimé)`.slice(0, 180),
      updated_at: now,
    })
    .eq("id", id)
    .eq("creator_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Listing supprimé" });
}
