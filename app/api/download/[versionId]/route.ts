import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DOWNLOADABLE_TYPES = new Set(["prompt"]);

export async function GET(
  _request: Request,
  { params }: { params: { versionId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: version } = await admin
    .from("listing_versions")
    .select("id, listing_id, bundle_path")
    .eq("id", params.versionId)
    .single();

  if (!version || !version.bundle_path) {
    return NextResponse.json({ error: "Version introuvable" }, { status: 404 });
  }

  const { data: listing } = await admin
    .from("listings")
    .select("id, price_cents, creator_id, type")
    .eq("id", version.listing_id)
    .single();

  if (!listing) {
    return NextResponse.json({ error: "Listing introuvable" }, { status: 404 });
  }

  if (!DOWNLOADABLE_TYPES.has(listing.type)) {
    return NextResponse.json(
      { error: "Les agents et workflows s'exécutent sur la plateforme — pas de téléchargement." },
      { status: 403 }
    );
  }

  if (listing.price_cents > 0 && listing.creator_id !== user.id) {
    const { data: purchase } = await admin
      .from("purchases")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("listing_id", listing.id)
      .eq("status", "completed")
      .single();

    if (!purchase) {
      return NextResponse.json({ error: "Achat requis" }, { status: 403 });
    }
  }

  await admin.from("downloads").insert({
    user_id: user.id,
    listing_id: listing.id,
    version_id: version.id,
  });

  const { data: signedUrl, error: signError } = await admin.storage
    .from("bundles")
    .createSignedUrl(version.bundle_path, 3600);

  if (signError || !signedUrl) {
    return NextResponse.json({ error: "Erreur de téléchargement" }, { status: 500 });
  }

  return NextResponse.json({ url: signedUrl.signedUrl });
}
