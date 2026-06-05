import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AgentManifestSchema } from "@/lib/agent/schema";
import { parseListingEnv } from "@/lib/agent/env";
import {
  resolveAgentRunKeys,
  holdAgentRunCredits,
  settleAgentRunCredits,
  releaseAgentRunCredits,
} from "@/lib/billing/agent-run-billing";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { isUnrestrictedUser } from "@/lib/auth/privileges";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const unrestricted = await isUnrestrictedUser(user.id);
  if (!unrestricted) {
    const rate = checkRateLimit(`run:agent:${user.id}`, RATE_LIMITS.run);
    if (!rate.success) {
      return rateLimitResponse(rate.resetAt);
    }
  }

  const body = await request.json();
  const {
    listingId,
    versionId,
    inputs = {},
    async: runAsyncParam,
    dryRun = false,
    preview,
    manifest: previewManifest,
    fullDemo = false,
  } = body as {
    listingId?: string;
    versionId?: string;
    inputs?: Record<string, string>;
    async?: boolean;
    dryRun?: boolean;
    preview?: boolean;
    manifest?: unknown;
    fullDemo?: boolean;
  };

  const admin = createAdminClient();
  const { runAgent } = await import("@/lib/agent/orchestrator");

  if (preview && previewManifest) {
    const parsed = AgentManifestSchema.safeParse(previewManifest);
    if (!parsed.success) {
      return NextResponse.json({ error: "Manifeste preview invalide" }, { status: 400 });
    }
    const { apiKeys } = await resolveAgentRunKeys(user.id, parsed.data, true, true);

    let previewRunId: string | undefined;
    if (fullDemo) {
      const { data: previewRun } = await admin
        .from("listing_agent_runs")
        .insert({
          user_id: user.id,
          listing_id: listingId ?? null,
          inputs,
          status: "running",
          dry_run: false,
          started_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          claimed_by: "preview",
        })
        .select("id")
        .single();
      previewRunId = previewRun?.id;
    }

    const result = await runAgent(parsed.data, {
      userId: user.id,
      listingId: listingId ?? "preview",
      inputs,
      apiKeys,
      runId: previewRunId,
      dryRun: !fullDemo,
      demoMode: !fullDemo,
    });

    if (previewRunId) {
      await admin
        .from("listing_agent_runs")
        .update({
          status: result.status,
          steps_completed: result.stepsCompleted,
          output: result.output,
          error_message: result.error ?? null,
        })
        .eq("id", previewRunId);
    }

    return NextResponse.json({ preview: true, runId: previewRunId, ...result });
  }

  if (!listingId || !versionId) {
    return NextResponse.json({ error: "listingId et versionId requis" }, { status: 400 });
  }

  const { data: listing } = await admin
    .from("listings")
    .select("id, type, status, creator_id, price_cents, current_version_id")
    .eq("id", listingId)
    .single();

  if (!listing || listing.type === "prompt") {
    return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
  }

  const { assertAllowedAgentVersion } = await import("@/lib/listings/resolve-agent-version");
  const versionCheck = await assertAllowedAgentVersion(admin, {
    listingId,
    userId: user.id,
    creatorId: listing.creator_id,
    currentVersionId: listing.current_version_id,
    requestedVersionId: versionId,
  });
  if (!versionCheck.ok) {
    return NextResponse.json({ error: versionCheck.error }, { status: 403 });
  }

  const isOwner = listing.creator_id === user.id;
  const isPublished = listing.status === "published";
  const isFree = listing.price_cents === 0;

  if (!isOwner && !isPublished) {
    return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
  }

  let hasEntitlement = isOwner;

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

    hasEntitlement = !!(subscription || purchase || isPro);

    if (!hasEntitlement && !isFree) {
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

  let billing: Awaited<ReturnType<typeof resolveAgentRunKeys>>;
  try {
    billing = await resolveAgentRunKeys(
      user.id,
      parsedEnv.manifest,
      hasEntitlement,
      isFree
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur billing" },
      { status: 402 }
    );
  }

  const { validateAgentPreflight } = await import("@/lib/agent/preflight");
  const preflightIssues = await validateAgentPreflight(
    parsedEnv.manifest,
    billing.apiKeys,
    user.id,
    { dryRun, creatorId: listing.creator_id }
  );
  if (preflightIssues.length > 0) {
    console.warn("[run/agent] preflight blocked", {
      userId: user.id,
      listingId,
      issues: preflightIssues,
    });
    return NextResponse.json(
      {
        error: "configuration_incomplete",
        message: preflightIssues[0].message,
        issues: preflightIssues,
      },
      { status: 400 }
    );
  }

  if (!dryRun) {
    const { checkConnectorHealth } = await import("@/lib/connectors/connection-health");
    const { runnerRequiredConnectors } = await import("@/lib/agent/run-connectors");
    const requiredConnectors = runnerRequiredConnectors(parsedEnv.manifest, {
      userId: user.id,
      creatorId: listing.creator_id,
    });
    const healthIssues = await checkConnectorHealth(user.id, requiredConnectors);
    if (healthIssues.length > 0) {
      return NextResponse.json(
        {
          error: "configuration_incomplete",
          message: healthIssues[0].message,
          issues: healthIssues.map((h) => ({
            code: "connector_health",
            message: h.message,
          })),
        },
        { status: 400 }
      );
    }
  }

  const runAsync =
    dryRun ? false : runAsyncParam !== undefined ? Boolean(runAsyncParam) : true;

  if (runAsync) {
    const { data: agentRun, error: insertError } = await admin
      .from("listing_agent_runs")
      .insert({
        user_id: user.id,
        listing_id: listingId,
        version_id: versionId,
        inputs,
        status: "pending",
        dry_run: dryRun,
        used_credits: billing.usedCredits,
        credit_hold_estimate_cents: billing.usedCredits ? billing.estimatedMax : null,
      })
      .select("id")
      .single();

    if (insertError || !agentRun?.id) {
      return NextResponse.json(
        { error: insertError?.message ?? "Impossible de créer le run" },
        { status: 500 }
      );
    }

    if (billing.usedCredits) {
      const held = await holdAgentRunCredits(user.id, agentRun.id, billing.estimatedMax);
      if (!held) {
        await admin.from("listing_agent_runs").update({ status: "failed" }).eq("id", agentRun.id);
        return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
      }
    }

    // Traite la file en arrière-plan (web dyno Render si worker dédié absent)
    void import("@/lib/worker/process-pending-runs")
      .then(({ processPendingAgentRuns }) => processPendingAgentRuns(1))
      .catch((err) =>
        console.error("[run/agent] process queue failed:", err instanceof Error ? err.message : err)
      );

    return NextResponse.json({
      runId: agentRun.id,
      status: "queued",
      message: "Agent en file d'attente — exécution en cours",
    });
  }

  const now = new Date().toISOString();

  const { data: agentRun } = await admin
    .from("listing_agent_runs")
    .insert({
      user_id: user.id,
      listing_id: listingId,
      version_id: versionId,
      inputs,
      status: "running",
      dry_run: dryRun,
      used_credits: billing.usedCredits,
      credit_hold_estimate_cents: billing.usedCredits ? billing.estimatedMax : null,
      started_at: now,
      heartbeat_at: now,
      claimed_by: "web-sync",
    })
    .select("id")
    .single();

  if (billing.usedCredits && agentRun?.id) {
    const held = await holdAgentRunCredits(user.id, agentRun.id, billing.estimatedMax);
    if (!held) {
      await admin
        .from("listing_agent_runs")
        .update({
          status: "failed",
          error_message: "Crédits insuffisants",
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", agentRun.id);
      return NextResponse.json({ error: "Crédits insuffisants" }, { status: 402 });
    }
  }

  const result = await runAgent(parsedEnv.manifest, {
    userId: user.id,
    listingId,
    creatorId: listing.creator_id,
    inputs,
    apiKeys: billing.apiKeys,
    runId: agentRun?.id,
    dryRun,
    onProgress: async (stepsCompleted) => {
      if (agentRun?.id) {
        await admin
          .from("listing_agent_runs")
          .update({
            steps_completed: stepsCompleted,
            heartbeat_at: new Date().toISOString(),
          })
          .eq("id", agentRun.id);
      }
    },
  });

  if (billing.usedCredits && agentRun?.id) {
    if (result.status === "completed" && result.usage) {
      await settleAgentRunCredits(user.id, agentRun.id, { steps: result.usage }, billing.estimatedMax);
    } else {
      await releaseAgentRunCredits(user.id, agentRun.id, billing.estimatedMax);
    }
  }

  await admin
    .from("listing_agent_runs")
    .update({
      status: result.status,
      steps_completed: result.stepsCompleted,
      output: result.output,
      error_message: result.error ?? null,
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", agentRun?.id ?? "");

  return NextResponse.json({ runId: agentRun?.id, dryRun, ...result });
}
