import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanContent } from "@/lib/content-filter";
import { allFindings } from "@/lib/secrets-scanner";
import { uniqueSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

interface EnvField {
  key: string;
  description: string;
  required: boolean;
}

interface CreateListingBody {
  title: string;
  type: "prompt" | "agent" | "workflow";
  categoryId: string | null;
  description: string | null;
  models: string[];
  tags: string[];
  priceCents: number;
  promptBody: string | null;
  envFields: EnvField[];
  dependencies: string | null;
  setupTime: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await request.json()) as CreateListingBody;

  const {
    title,
    type,
    categoryId,
    description,
    models,
    tags,
    priceCents,
    promptBody,
    envFields,
    dependencies,
    setupTime,
  } = body;

  if (!title || !type) {
    return NextResponse.json(
      { error: "Titre et type requis" },
      { status: 400 }
    );
  }

  const textToScan = [description, promptBody].filter(Boolean).join("\n\n");
  const contentScan = scanContent(textToScan);
  const bundleFindings = promptBody ? allFindings(promptBody) : [];
  const allFlags = [...contentScan.flags, ...bundleFindings];

  const status = allFlags.length > 0 ? "under_review" : "draft";
  const contentFlags = allFlags.length > 0 ? allFlags : [];

  const slug = uniqueSlug(title);

  const adminClient = createAdminClient();

  const { data: listing, error: listingError } = await adminClient
    .from("listings")
    .insert({
      creator_id: user.id,
      category_id: categoryId || null,
      type,
      title,
      slug,
      description,
      models,
      tags,
      price_cents: priceCents,
      currency: "eur",
      status,
      content_flags: contentFlags,
    })
    .select("id")
    .single();

  if (listingError || !listing) {
    return NextResponse.json(
      { error: listingError?.message || "Erreur lors de la création" },
      { status: 500 }
    );
  }

  const envData = JSON.parse(
    JSON.stringify({
      fields: envFields,
      dependencies: dependencies || null,
      setup_time: setupTime || null,
    })
  );

  const { data: version, error: versionError } = await adminClient
    .from("listing_versions")
    .insert({
      listing_id: listing.id,
      semver: "v1.0",
      prompt_body: promptBody || null,
      env: envData,
      bundle_path: null,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    return NextResponse.json(
      { error: versionError?.message || "Erreur création version" },
      { status: 500 }
    );
  }

  await adminClient
    .from("listings")
    .update({ current_version_id: version.id })
    .eq("id", listing.id);

  return NextResponse.json({
    id: listing.id,
    versionId: version.id,
    flagged: allFlags.length > 0,
    flags: allFlags,
  });
}
