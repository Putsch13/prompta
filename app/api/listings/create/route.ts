import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanContent } from "@/lib/content-filter";
import { allFindings } from "@/lib/secrets-scanner";
import { uniqueSlug } from "@/lib/slug";
import { AgentManifestSchema } from "@/lib/agent/schema";
import { canSellPaid } from "@/lib/platform-access";

export const dynamic = "force-dynamic";

interface CreateListingBody {
  title: string;
  type: "prompt" | "agent" | "workflow";
  categoryId: string | null;
  description: string | null;
  models: string[];
  techStack?: string[];
  integrations?: string[];
  tags: string[];
  priceCents: number;
  pricingMode?: "free" | "one_time" | "subscription";
  subscriptionPriceCents?: number;
  promptBody: string | null;
  manifest?: unknown;
  envFields?: unknown[];
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
    techStack = [],
    integrations = [],
    tags,
    priceCents,
    pricingMode = "free",
    subscriptionPriceCents = 0,
    promptBody,
    manifest,
    setupTime,
  } = body;

  if (!title || !type) {
    return NextResponse.json({ error: "Titre et type requis" }, { status: 400 });
  }

  const isPaid =
    pricingMode !== "free" &&
    (priceCents > 0 || (pricingMode === "subscription" && subscriptionPriceCents > 0));

  if (isPaid) {
    const sell = await canSellPaid(user.id);
    if (!sell.canSell) {
      return NextResponse.json(
        {
          error: "stripe_kyc_required",
          message:
            "Complétez votre vérification Stripe pour publier du contenu payant, ou publiez en gratuit.",
        },
        { status: 403 }
      );
    }
  }

  if (!manifest) {
    return NextResponse.json({ error: "Manifeste requis" }, { status: 400 });
  }

  const manifestParsed = AgentManifestSchema.safeParse(manifest);
  if (!manifestParsed.success) {
    return NextResponse.json(
      { error: "Manifeste invalide", details: manifestParsed.error.flatten() },
      { status: 400 }
    );
  }

  const textToScan = [description, promptBody, JSON.stringify(manifest)].filter(Boolean).join("\n\n");
  const contentScan = scanContent(textToScan);
  const bundleFindings = promptBody ? allFindings(promptBody) : [];
  const allFlags = [...contentScan.flags, ...bundleFindings];

  const status = allFlags.length > 0 ? "under_review" : "draft";
  const contentFlags = allFlags.length > 0 ? allFlags : [];

  const slug = uniqueSlug(title);
  const adminClient = createAdminClient();

  const effectivePrice =
    pricingMode === "free" ? 0 : pricingMode === "subscription" ? 0 : priceCents;

  const insertData = {
    creator_id: user.id,
    category_id: categoryId || null,
    type,
    title,
    slug,
    description,
    models,
    tags,
    price_cents: effectivePrice,
    subscription_price_cents:
      pricingMode === "subscription" ? subscriptionPriceCents : 0,
    pricing_mode: pricingMode,
    currency: "eur",
    status,
    content_flags: contentFlags,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  if (techStack.length > 0) insertData.tech_stack = techStack;
  if (integrations.length > 0) insertData.integrations = integrations;

  const { data: listing, error: listingError } = await adminClient
    .from("listings")
    .insert(insertData)
    .select("id")
    .single();

  if (listingError || !listing) {
    return NextResponse.json(
      { error: listingError?.message || "Erreur lors de la création" },
      { status: 500 }
    );
  }

  const envData = {
    manifest: manifestParsed.data,
    meta: {
      setup_time: setupTime || null,
    },
  };

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
