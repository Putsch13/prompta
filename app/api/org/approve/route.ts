import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { orgListingId, action, orgSlug } = await request.json();
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  const { data: membership } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux admins org" }, { status: 403 });
  }

  const newStatus = action === "approve" ? "approved" : "archived";

  const { data: updated, error } = await admin
    .from("org_listings")
    .update({
      status: newStatus,
      approved_by: action === "approve" ? user.id : null,
      approved_at: action === "approve" ? new Date().toISOString() : null,
    })
    .eq("id", orgListingId)
    .eq("org_id", org.id)
    .select("id, title, status")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
  }

  await admin.from("org_audit_log").insert({
    org_id: org.id,
    user_id: user.id,
    action: action === "approve" ? "approve_listing" : "reject_listing",
    metadata: { org_listing_id: orgListingId },
  });

  return NextResponse.json({ orgListing: updated });
}
