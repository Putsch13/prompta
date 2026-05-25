import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AgentManifestSchema } from "@/lib/agent/schema";
import { parseListingEnv } from "@/lib/agent/env";
import { shouldRunSync } from "@/lib/builder/manifest";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const {
    listingId,
    versionId,
    inputs = {},
    async: runAsyncParam,
    preview,
    manifest: previewManifest,
  } = body as {
    listingId?: string;
    versionId?: string;
    inputs?: Record<string, string>;
    async?: boolean;
    preview?: boolean;
    manifest?: unknown;
  };

  const admin = createAdminClient();
  const providers = ["openai", "anthropic", "google", "mistral", "serper"] as const;
  const apiKeys: Record<string, string> = {};
  const { getUserKey } = await import("@/lib/keys");
  for (const p of providers) {
    const key = await getUserKey(user.id, p);
    if (key) apiKeys[p] = key;
  }

  const { runAgent } = await import("@/lib/agent/orchestrator");

  // Mode preview builder (Bloc 10)
  if (preview && previewManifest) {
    const parsed = AgentManifestSchema.safeParse(previewManifest);
    if (!parsed.success) {
      return NextResponse.json({ error: "Manifeste preview invalide" }, { status: 400 });
    }
    const result = await runAgent(parsed.data, {
      userId: user.id,
      listingId: listingId ?? "preview",
      inputs,
      apiKeys,
    });
    return NextResponse.json({ preview: true, ...result });
  }

  if (!listingId || !versionId) {
    return NextResponse.json({ error: "listingId et versionId requis" }, { status: 400 });
  }

  const { data: listing } = await admin
    .from("listings")
    .select("id, type, status, creator_id")
    .eq("id", listingId)
    .single();

  if (!listing || listing.type === "prompt") {
    return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
  }

  const isOwner = listing.creator_id === user.id;
  const isPublished = listing.status === "published";

  if (!isOwner && !isPublished) {
    return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
  }

  if (!isOwner) {
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .eq("listing_id", listingId)
      .eq("status", "active")
      .maybeSingle();

    const { data: purchase } = await admin
      .from("purchases")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("listing_id", listingId)
      .eq("status", "completed")
      .maybeSingle();

    const isPro = await (await import("@/lib/platform-access")).hasPlatformPro(user.id);

    if (!subscription && !purchase && !isPro) {
      return NextResponse.json({ error: "Abonnement ou achat requis" }, { status: 403 });
    }
  }

  const { data: version } = await admin
    .from("listing_versions")
    .select("env, prompt_body")
    .eq("id", versionId)
    .single();

  const parsedEnv = parseListingEnv(version?.env, version?.prompt_body);
  if (!parsedEnv) {
    return NextResponse.json({ error: "Manifeste agent manquant" }, { status: 400 });
  }

  const runAsync =
    runAsyncParam !== undefined ? runAsyncParam : !shouldRunSync(parsedEnv.manifest);

  if (runAsync) {
    const { data: agentRun } = await admin
      .from("listing_agent_runs")
      .insert({
        user_id: user.id,
        listing_id: listingId,
        version_id: versionId,
        inputs,
        status: "pending",
      })
      .select("id")
      .single();

    return NextResponse.json({
      runId: agentRun?.id,
      status: "queued",
      message: "Agent en file d'attente — traité par le worker",
    });
  }

  const { data: agentRun } = await admin
    .from("listing_agent_runs")
    .insert({
      user_id: user.id,
      listing_id: listingId,
      version_id: versionId,
      inputs,
      status: "running",
    })
    .select("id")
    .single();

  const result = await runAgent(parsedEnv.manifest, {
    userId: user.id,
    listingId,
    inputs,
    apiKeys,
  });

  await admin
    .from("listing_agent_runs")
    .update({
      status: result.status,
      steps_completed: result.stepsCompleted,
      output: result.output,
      error_message: result.error ?? null,
    })
    .eq("id", agentRun?.id ?? "");

  return NextResponse.json({ runId: agentRun?.id, ...result });
}
