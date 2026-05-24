import { NextRequest, NextResponse } from "next/server";
import { checkAdminApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const admin = await checkAdminApi();
  if (!admin) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const action = formData.get("action") as string;
  const listingId = formData.get("listingId") as string | null;
  const flagId = formData.get("flagId") as string | null;
  const reason = formData.get("reason") as string | null;

  const supabase = createAdminClient();

  if (action === "approve" && listingId) {
    const { error } = await supabase
      .from("listings")
      .update({
        status: "published",
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.redirect(
      new URL("/admin/moderation", request.url),
      303
    );
  }

  if (action === "reject" && listingId) {
    const { error } = await supabase
      .from("listings")
      .update({
        status: "rejected",
        reason_rejected: reason || "Contenu non conforme aux règles de la plateforme",
        updated_at: new Date().toISOString(),
      })
      .eq("id", listingId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.redirect(
      new URL("/admin/moderation", request.url),
      303
    );
  }

  if (action === "resolve" && flagId) {
    const { error } = await supabase
      .from("moderation_flags")
      .update({
        status: "resolved",
        resolved_by: admin.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", flagId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.redirect(
      new URL("/admin/moderation#signalements", request.url),
      303
    );
  }

  return NextResponse.json(
    { error: "Action non reconnue" },
    { status: 400 }
  );
}
