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

  const { listingId, versionId, inputs = {}, async: runAsync = true } = await request.json();

  const admin = createAdminClient();

  const { data: listing } = await admin
    .from("listings")
    .select("id, type, status")
    .eq("id", listingId)
    .eq("status", "published")
    .single();

  if (!listing || listing.type === "prompt") {
    return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
  }

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

  const { data: version } = await admin
    .from("listing_versions")
    .select("env")
    .eq("id", versionId)
    .single();

  if (!version?.env) {
    return NextResponse.json({ error: "Manifeste agent manquant" }, { status: 400 });
  }

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

  const providers = ["openai", "anthropic", "google", "mistral", "serper"] as const;
  const apiKeys: Record<string, string> = {};
  const { getUserKey } = await import("@/lib/keys");
  for (const p of providers) {
    const key = await getUserKey(user.id, p);
    if (key) apiKeys[p] = key;
  }

  const { runAgent } = await import("@/lib/agent/orchestrator");

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

  const result = await runAgent(version.env, {
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
