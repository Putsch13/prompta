import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseListingEnv } from "@/lib/agent/env";
import { getBuilderApiKey } from "@/lib/builder/api-key";
import { diagnoseFailedSteps, type FailedStepInfo } from "@/lib/agent/diagnose-run";
import { autoFixRun } from "@/lib/agent/auto-fix-run";
import { buildManifest } from "@/lib/builder/manifest";
import { buildContract } from "@/lib/agent/contract";
import {
  validateAgentManifest,
  hasBlockingIssues,
} from "@/lib/builder/validate-agent";
import { connectorsForSteps } from "@/lib/connectors/registry";
import { AgentManifestSchema } from "@/lib/agent/schema";
import type { KeyProvider } from "@/lib/keys";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { modelId?: string };
  const admin = createAdminClient();
  const runId = params.runId;

  const { data: run } = await (admin as any)
    .from("listing_agent_runs")
    .select("id, user_id, listing_id, version_id, inputs, status")
    .eq("id", runId)
    .single();
  if (!run) {
    return NextResponse.json({ error: "Run introuvable" }, { status: 404 });
  }

  const isOwner = run.user_id === user.id;
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!isOwner && !profile?.is_admin) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  if (!run.version_id || !run.listing_id) {
    return NextResponse.json(
      { error: "Run sans version/agent associé — auto-correction indisponible." },
      { status: 400 },
    );
  }

  // Étapes en échec (avec aperçus + détail technique).
  const { data: steps } = await (admin as any)
    .from("listing_agent_run_steps")
    .select(
      "step_index, label, status, error_code, error_message, action_slug, tool_slug, error_detail, input_preview, output_preview",
    )
    .eq("run_id", runId)
    .eq("status", "failed")
    .order("step_index", { ascending: true });

  const failed = (steps ?? []).map((s: any) => ({
    stepIndex: s.step_index,
    label: s.label,
    errorCode: s.error_code,
    errorMessage: s.error_message,
    actionSlug: s.action_slug,
    toolSlug: s.tool_slug,
    connector: (s.error_detail && (s.error_detail.connector as string)) || null,
    inputPreview: s.input_preview,
    outputPreview: s.output_preview,
    errorDetail: s.error_detail,
  }));

  // Manifeste courant du run.
  const { data: version } = await (admin as any)
    .from("listing_versions")
    .select("env, prompt_body")
    .eq("id", run.version_id)
    .single();
  const parsedEnv = parseListingEnv(version?.env, version?.prompt_body);
  const manifest = parsedEnv?.manifest;
  if (!manifest) {
    return NextResponse.json(
      { error: "Manifeste introuvable pour ce run." },
      { status: 400 },
    );
  }

  const { data: listing } = await admin
    .from("listings")
    .select("id, creator_id, status, current_version_id")
    .eq("id", run.listing_id)
    .single();
  const isCreator = !!listing && listing.creator_id === user.id;

  const failedInfo: FailedStepInfo[] = failed.map((f: any) => ({
    stepIndex: f.stepIndex,
    label: f.label,
    errorCode: f.errorCode,
    errorMessage: f.errorMessage,
    actionSlug: f.actionSlug,
    toolSlug: f.toolSlug,
    connector: f.connector,
  }));
  const { fixes } = diagnoseFailedSteps(failedInfo);

  const keyResult = await getBuilderApiKey(user.id, body.modelId ?? "gpt-5.4");
  if (!keyResult.ok) {
    return NextResponse.json({ error: keyResult.error }, { status: 503 });
  }

  let ai;
  try {
    ai = await autoFixRun({
      steps: manifest.steps,
      failed,
      fixes,
      apiKey: keyResult.apiKey,
      resolved: keyResult.resolved,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'auto-correction IA" },
      { status: 500 },
    );
  }

  let applied = false;
  let appliedVersionId: string | null = run.version_id;
  let blockedReason: string | null = null;

  // On ne persiste une correction de plan que pour le créateur de l'agent.
  if (ai.autoFixable && ai.correctedSteps) {
    if (!isCreator) {
      blockedReason =
        "La correction du plan ne peut être appliquée que par le créateur de l'agent.";
    } else {
      // Reconstruire un manifeste cohérent et le valider avant persistance.
      const rebuilt = buildManifest({
        type: manifest.kind ?? "agent",
        kind: manifest.kind,
        executionMode: manifest.executionMode,
        promptBody: version?.prompt_body ?? "",
        steps: ai.correctedSteps,
        requiredSecrets: (manifest.secrets ?? []) as KeyProvider[],
        requiredConnectors: connectorsForSteps(ai.correctedSteps),
      });

      const schemaOk = AgentManifestSchema.safeParse(rebuilt);
      const validation = validateAgentManifest(ai.correctedSteps, {
        connectors: rebuilt.connectors,
      });

      if (!schemaOk.success || hasBlockingIssues(validation)) {
        blockedReason =
          "Le plan corrigé n'a pas passé la validation — aucune modification appliquée.";
        ai = { ...ai, autoFixable: false, correctedSteps: null, changes: [] };
      } else {
        const envPayload = {
          manifest: JSON.parse(JSON.stringify(rebuilt)),
          meta: { ...(parsedEnv?.meta ?? {}), auto_fixed_at: new Date().toISOString() },
        };
        const contract = JSON.parse(JSON.stringify(buildContract(rebuilt.steps)));

        if (listing?.status === "published") {
          const { data: currentVersion } = await admin
            .from("listing_versions")
            .select("semver")
            .eq("id", listing.current_version_id ?? run.version_id)
            .single();
          const oldSemver = (currentVersion as any)?.semver ?? "1.0.0";
          const parts = String(oldSemver).split(".").map(Number);
          const newSemver = `${parts[0]}.${(parts[1] ?? 0) + 1}.0`;

          const { data: newVersion } = await (admin as any)
            .from("listing_versions")
            .insert({
              listing_id: run.listing_id,
              semver: newSemver,
              changelog: `Auto-correction IA ${newSemver}`,
              prompt_body: version?.prompt_body ?? null,
              env: envPayload,
              contract,
            })
            .select("id")
            .single();

          if (newVersion?.id) {
            await (admin as any)
              .from("listings")
              .update({ current_version_id: newVersion.id })
              .eq("id", run.listing_id);
            appliedVersionId = newVersion.id;
            applied = true;
          }
        } else {
          await (admin as any)
            .from("listing_versions")
            .update({ env: envPayload, contract })
            .eq("id", run.version_id);
          appliedVersionId = run.version_id;
          applied = true;
        }
      }
    }
  }

  return NextResponse.json({
    explanation: ai.explanation,
    changes: ai.changes,
    requiresUser: ai.requiresUser,
    autoFixable: ai.autoFixable,
    applied,
    blockedReason,
    relaunch: {
      listingId: run.listing_id,
      versionId: appliedVersionId,
      inputs: (run.inputs ?? {}) as Record<string, string>,
    },
  });
}
