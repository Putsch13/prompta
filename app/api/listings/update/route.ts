import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanContent } from "@/lib/content-filter";
import { allFindings } from "@/lib/secrets-scanner";

export const dynamic = "force-dynamic";

interface UpdateListingBody {
  listingId: string;
  title?: string;
  description?: string | null;
  promptBody?: string | null;
  models?: string[];
  tags?: string[];
  priceCents?: number;
  envFields?: unknown[];
  dependencies?: string | null;
  setupTime?: string | null;
  publish?: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await request.json()) as UpdateListingBody;
  const admin = createAdminClient();

  const { data: listing } = await admin
    .from("listings")
    .select("id, creator_id, current_version_id")
    .eq("id", body.listingId)
    .single();

  if (!listing || listing.creator_id !== user.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const textToScan = [body.description, body.promptBody].filter(Boolean).join("\n\n");
  const contentScan = scanContent(textToScan);
  const bundleScan = body.promptBody ? allFindings(body.promptBody) : [];
  const allFlags = [...contentScan.flags, ...bundleScan];

  const updates: {
    updated_at: string;
    title?: string;
    description?: string | null;
    models?: string[];
    tags?: string[];
    price_cents?: number;
    status?: "draft" | "under_review" | "published" | "rejected";
    content_flags?: string[];
  } = {
    updated_at: new Date().toISOString(),
  };

  if (body.title) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.models) updates.models = body.models;
  if (body.tags) updates.tags = body.tags;
  if (body.priceCents !== undefined) updates.price_cents = body.priceCents;

  if (body.publish) {
    updates.status = allFlags.length > 0 ? "under_review" : "under_review";
    updates.content_flags = allFlags;
  }

  await admin.from("listings").update(updates).eq("id", body.listingId);

  if (body.promptBody !== undefined && listing.current_version_id) {
    const envData = {
      fields: body.envFields ?? [],
      dependencies: body.dependencies ?? null,
      setup_time: body.setupTime ?? null,
    };

    await admin
      .from("listing_versions")
      .update({
        prompt_body: body.promptBody,
        env: JSON.parse(JSON.stringify(envData)),
      })
      .eq("id", listing.current_version_id);
  }

  return NextResponse.json({
    success: true,
    flagged: allFlags.length > 0,
    flags: allFlags,
  });
}
