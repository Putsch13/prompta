import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Résout la version exécutable d'un agent pour le lancement direct depuis
 * « Mes agents ». Retourne { versionId, slug } pour que le client lance le run
 * via /api/run/agent (qui gère preflight, droits et facturation).
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: listing } = await admin
    .from("listings")
    .select("id, slug, type, current_version_id, creator_id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!listing) {
    return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
  }
  if (listing.type === "prompt") {
    return NextResponse.json({ error: "Ce contenu n'est pas un agent." }, { status: 400 });
  }
  if (!listing.current_version_id) {
    return NextResponse.json({ error: "Aucune version exécutable." }, { status: 400 });
  }

  return NextResponse.json({
    versionId: listing.current_version_id,
    slug: listing.slug,
  });
}
