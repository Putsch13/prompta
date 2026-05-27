import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/listings/:id — Soft-delete un listing.
 * - Vérifie que l'user est le créateur.
 * - Refuse si abonnements actifs existent.
 * - Passe status = "deleted" (jamais de hard delete).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    .select("id, creator_id, status")
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

  const { count: activeSubs } = await admin
    .from("subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("listing_id", id)
    .eq("status", "active");

  if ((activeSubs ?? 0) > 0) {
    return NextResponse.json(
      {
        error: "Impossible de supprimer : des abonnés actifs existent. Désactivez d'abord l'agent.",
      },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("listings")
    .update({ status: "deleted" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Listing supprimé" });
}
