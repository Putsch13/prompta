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
  const supabase = await createClient();
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
    resumeFromStep,
    resumeOutputs,
  } = body as {
    listingId?: string;
    versionId?: string;
    inputs?: Record<string, string>;
    async?: boolean;
    dryRun?: boolean;
    preview?: boolean;
    manifest?: unknown;
    fullDemo?: boolean;
    resumeFromStep?: number;
    resumeOutputs?: Record<string, string>;
  };

  const admin = createAdminClient();
  const { runAgent } = await import("@/lib/agent/orchestrator");
  const {
    buildRunResourcesFromInputs,
    validateRunResourcesForExecution,
    validateRequiredInputs,
  } = await import("@/lib/agent/build-run-resources");

  function prepareRunContext(manifest: import("@/lib/agent/schema").AgentManifest, rawInputs: Record<string, string>) {
    const { cleanInputs, resources } = buildRunResourcesFromInputs(manifest, rawInputs);
    return { inputs: cleanInputs, resources };
  }

  if (preview && previewManifest) {
    const parsed = AgentManifestSchema.safeParse(previewManifest);
    if (!parsed.success) {
      return NextResponse.json({ error: "Manifeste preview invalide" }, { status: 400 });
    }
    const { apiKeys } = await resolveAgentRunKeys(user.id, parsed.data, true, true);
    // dry-run = aperçu opt-in : on respecte le body (défaut false).
    // fullDemo conserve sa sémantique « persister le run en base ».
    const previewDryRun = dryRun === true;
    if (!previewDryRun) {
      const resourceIssues = [
        ...validateRunResourcesForExecution(parsed.data, inputs),
        ...validateRequiredInputs(parsed.data, inputs),
      ];
      if (resourceIssues.length > 0) {
        return NextResponse.json(
          {
            error: "configuration_incomplete",
            message: resourceIssues[0].message,
            issues: resourceIssues,
          },
          { status: 400 },
        );
      }
    }
    const { inputs: previewInputs, resources: previewResources } = prepareRunContext(parsed.data, inputs);

    // Exécution RÉELLE depuis le builder : le run est persisté avec son
    // manifeste embarqué et traité par le worker comme n'importe quel run
    // (console live SSE, reprise après approbation via /dashboard/validations,
    // protection reaper). Avant : exécution synchrone in-process → aucune
    // étape visible pendant le test, et approbation orpheline si on quittait.
    const shouldPersistPreview = fullDemo || !previewDryRun;
    if (shouldPersistPreview && !previewDryRun) {
      const { data: previewRun, error: insertError } = await admin
        .from("listing_agent_runs")
        .insert({
          user_id: user.id,
          listing_id: listingId ?? null,
          inputs: {
            ...previewInputs,
            ...previewResources,
            __manifest: JSON.stringify(parsed.data),
          },
          status: "pending",
          dry_run: false,
        })
        .select("id")
        .single();

      if (insertError || !previewRun?.id) {
        return NextResponse.json(
          { error: insertError?.message ?? "Impossible de créer le run de test" },
          { status: 500 },
        );
      }

      void import("@/lib/worker/process-pending-runs")
        .then(({ processPendingAgentRuns }) =>
          processPendingAgentRuns(1, { runId: previewRun.id }),
        )
        .catch((err) =>
          console.error("[run/agent] preview queue failed:", err instanceof Error ? err.message : err),
        );

      return NextResponse.json({
        preview: true,
        runId: previewRun.id,
        status: "queued",
        message: "Test en file d'attente — suivez les étapes en direct",
      });
    }

    // Aperçu simulé (dry-run) : rapide et sans effet de bord → synchrone.
    const result = await runAgent(parsed.data, {
      userId: user.id,
      listingId: listingId ?? "preview",
      inputs: previewInputs,
      resources: previewResources,
      apiKeys,
      dryRun: previewDryRun,
      demoMode: previewDryRun,
      // Compat : reprise live legacy (plus utilisée par le builder).
      ...(typeof resumeFromStep === "number" ? { resumeFromStep } : {}),
      ...(resumeOutputs ? { resumeOutputs } : {}),
    });

    return NextResponse.json({ preview: true, ...result });
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
  const preflightIssues = await validateAgentPreflight(parsedEnv.manifest, billing.apiKeys);
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
    const { checkConnectorHealth, blockingHealthIssues } = await import(
      "@/lib/connectors/connection-health"
    );
    const { runnerRequiredConnectors } = await import("@/lib/agent/run-connectors");
    const requiredConnectors = runnerRequiredConnectors(parsedEnv.manifest, {
      userId: user.id,
      creatorId: listing.creator_id,
    });
    const healthIssues = await checkConnectorHealth(user.id, requiredConnectors);
    const blockers = blockingHealthIssues(healthIssues);
    // On ne refuse le lancement que pour un vrai blocage (pas de connexion / token
    // absent ou expiré). Les signaux scope/identité ne bloquent plus — sinon on
    // refuse des connexions que l'UI montre « connecté » alors qu'elles marchent.
    if (blockers.length > 0) {
      console.warn("[run/agent] connector health blocked", {
        userId: user.id,
        listingId,
        blockers: blockers.map((b) => b.code),
      });
      return NextResponse.json(
        {
          error: "configuration_incomplete",
          message: blockers[0].message,
          issues: blockers.map((h) => ({
            code: "connector_health",
            message: h.message,
          })),
        },
        { status: 400 }
      );
    }
  }

  if (!dryRun) {
    const resourceIssues = [
      ...validateRunResourcesForExecution(parsedEnv.manifest, inputs),
      ...validateRequiredInputs(parsedEnv.manifest, inputs),
    ];
    if (resourceIssues.length > 0) {
      return NextResponse.json(
        {
          error: "configuration_incomplete",
          message: resourceIssues[0].message,
          issues: resourceIssues,
        },
        { status: 400 },
      );
    }
  }

  const { inputs: runInputs, resources: runResources } = prepareRunContext(parsedEnv.manifest, inputs);
  const storedInputs = { ...runInputs, ...runResources };

  const runAsync =
    dryRun ? false : runAsyncParam !== undefined ? Boolean(runAsyncParam) : true;

  if (runAsync) {
    const { data: agentRun, error: insertError } = await admin
      .from("listing_agent_runs")
      .insert({
        user_id: user.id,
        listing_id: listingId,
        version_id: versionId,
        inputs: storedInputs,
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

    // Traite CE run en arrière-plan (web dyno Render si worker dédié absent).
    void import("@/lib/worker/process-pending-runs")
      .then(({ processPendingAgentRuns }) =>
        processPendingAgentRuns(1, { runId: agentRun.id }),
      )
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
      inputs: storedInputs,
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
    inputs: runInputs,
    resources: runResources,
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
    } else if (result.status !== "awaiting_approval") {
      // awaiting_approval = pause : le hold reste posé, il sera régularisé
      // à la reprise par le worker (même logique que process-pending-runs).
      await releaseAgentRunCredits(user.id, agentRun.id, billing.estimatedMax);
    }
  }

  await admin
    .from("listing_agent_runs")
    .update({
      status: result.status,
      steps_completed: result.stepsCompleted,
      output: result.output,
      // En attente d'approbation = pas une erreur : pas de message d'erreur
      // (sinon le run paraît échoué dans l'UI).
      error_message: result.status === "awaiting_approval" ? null : (result.error ?? null),
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", agentRun?.id ?? "");

  return NextResponse.json({ runId: agentRun?.id, dryRun, ...result });
}
