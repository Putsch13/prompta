import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanContent } from "@/lib/content-filter";
import { allFindings } from "@/lib/secrets-scanner";
import { AgentManifestSchema } from "@/lib/agent/schema";
import {
  assertManifestValidForPublish,
  stripManifestForPublish,
} from "@/lib/builder/validate-manifest-for-publish";
import { canSellPaid } from "@/lib/platform-access";

export const dynamic = "force-dynamic";

interface UpdateListingBody {
  listingId: string;
  title?: string;
  description?: string | null;
  promptBody?: string | null;
  models?: string[];
  techStack?: string[];
  integrations?: string[];
  tags?: string[];
  priceCents?: number;
  pricingMode?: "free" | "one_time" | "subscription";
  subscriptionPriceCents?: number;
  manifest?: unknown;
  envFields?: unknown[];
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
    .select("id, creator_id, current_version_id, pricing_mode, price_cents, subscription_price_cents, status")
    .eq("id", body.listingId)
    .single();

  if (!listing || listing.creator_id !== user.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const pricingMode = body.pricingMode ?? listing.pricing_mode ?? "free";
  const priceCents = body.priceCents ?? listing.price_cents ?? 0;
  const subscriptionPriceCents =
    body.subscriptionPriceCents ?? listing.subscription_price_cents ?? 0;

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

  const textToScan = [body.description, body.promptBody].filter(Boolean).join("\n\n");
  const contentScan = scanContent(textToScan);
  const bundleScan = body.promptBody ? allFindings(body.promptBody) : [];
  const allFlags = [...contentScan.flags, ...bundleScan];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (body.title) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.models) updates.models = body.models;
  if (body.techStack) updates.tech_stack = body.techStack;
  if (body.integrations) updates.integrations = body.integrations;
  if (body.tags) updates.tags = body.tags;
  if (body.priceCents !== undefined) updates.price_cents = body.priceCents;
  if (body.subscriptionPriceCents !== undefined) {
    updates.subscription_price_cents = body.subscriptionPriceCents;
  }
  if (body.pricingMode) updates.pricing_mode = body.pricingMode;

  if (body.publish) {
    updates.status = allFlags.length > 0 ? "under_review" : "published";
    updates.content_flags = allFlags;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin.from("listings") as any).update(updates).eq("id", body.listingId);

  if (listing.current_version_id && (body.promptBody !== undefined || body.manifest)) {
    let envPayload: { manifest: unknown; meta: Record<string, unknown> } | null = null;

    if (body.manifest) {
      const manifestParsed = AgentManifestSchema.safeParse(body.manifest);
      if (!manifestParsed.success) {
        return NextResponse.json({ error: "Manifeste invalide" }, { status: 400 });
      }
      const publishManifest = stripManifestForPublish(manifestParsed.data);
      try {
        assertManifestValidForPublish(publishManifest);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Manifeste invalide" },
          { status: 400 }
        );
      }
      envPayload = {
        manifest: publishManifest,
        meta: {
          setup_time: body.setupTime ?? null,
        },
      };
    }

    const hasVersionUpdate = body.promptBody !== undefined || envPayload;
    if (hasVersionUpdate) {
      // Si l'agent est publié, créer une nouvelle version au lieu d'écraser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listingStatus = (listing as any).status ?? updates.status;
      if (listingStatus === "published") {
        const { data: currentVersion } = await admin
          .from("listing_versions")
          .select("semver, prompt_body, env")
          .eq("id", listing.current_version_id)
          .single();

        const oldSemver = currentVersion?.semver ?? "1.0.0";
        const parts = oldSemver.split(".").map(Number);
        const newSemver = `${parts[0]}.${(parts[1] ?? 0) + 1}.0`;

        const { data: newVersion } = await admin
          .from("listing_versions")
          .insert({
            listing_id: body.listingId,
            semver: newSemver,
            changelog: `Mise à jour ${newSemver}`,
            prompt_body: body.promptBody !== undefined ? body.promptBody : (currentVersion?.prompt_body ?? null),
            env: envPayload ? JSON.parse(JSON.stringify(envPayload)) : (currentVersion?.env ?? null),
          })
          .select("id")
          .single();

        if (newVersion) {
          await admin
            .from("listings")
            .update({ current_version_id: newVersion.id })
            .eq("id", body.listingId);
        }
      } else {
        await admin
          .from("listing_versions")
          .update({
            ...(body.promptBody !== undefined ? { prompt_body: body.promptBody } : {}),
            ...(envPayload ? { env: JSON.parse(JSON.stringify(envPayload)) } : {}),
          })
          .eq("id", listing.current_version_id);
      }
    }
  }

  return NextResponse.json({
    success: true,
    flagged: allFlags.length > 0,
    flags: allFlags,
  });
}
