import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getOrgRole(orgSlug: string, userId: string) {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();
  if (!org) return null;

  const { data: member } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .single();

  if (!member) return null;
  return { orgId: org.id, role: member.role as "admin" | "editor" | "reader" };
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { orgSlug, listingId } = await request.json();
  const access = await getOrgRole(orgSlug, user.id);

  if (!access || access.role === "reader") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: listing } = await admin
    .from("listings")
    .select("id, title, type, current_version_id, status, models")
    .eq("id", listingId)
    .eq("status", "published")
    .single();

  if (!listing) {
    return NextResponse.json({ error: "Listing introuvable" }, { status: 404 });
  }

  const { data: version } = await admin
    .from("listing_versions")
    .select("prompt_body, env")
    .eq("id", listing.current_version_id ?? "")
    .single();

  const status = access.role === "admin" ? "approved" : "pending_approval";

  const { data: orgListing, error } = await admin
    .from("org_listings")
    .insert({
      org_id: access.orgId,
      source_listing_id: listing.id,
      title: listing.title,
      type: listing.type,
      status,
      created_by: user.id,
      content: {
        prompt_body: version?.prompt_body ?? null,
        env: version?.env ?? null,
        models: listing.models ?? [],
      },
      approved_by: status === "approved" ? user.id : null,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    })
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("org_audit_log").insert({
    org_id: access.orgId,
    user_id: user.id,
    action: "import_listing",
    metadata: { listing_id: listingId, org_listing_id: orgListing?.id, status },
  });

  return NextResponse.json({ orgListing });
}
