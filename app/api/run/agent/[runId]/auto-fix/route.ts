import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseListingEnv } from "@/lib/agent/env";
import { getBuilderApiKey } from "@/lib/builder/api-key";
import { builderRateLimit } from "@/lib/builder/rate-limit";
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

export async function POST(request: NextRequest, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const limited = await builderRateLimit(user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    modelId?: string;
    /** Réponses de l'utilisateur aux questions posées par une passe précédente. */
    answers?: Record<string, string>;
  };
  const admin = createAdminClient();
  const runId = params.runId;

  const { data: run } = await admin
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

  const isTestRun = !run.version_id;

  // Étapes en échec (avec aperçus + détail technique).
  const { data: steps } = await admin
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

  // Manifeste courant du run : version publiée, ou manifeste embarqué (test).
  let version: { env: unknown; prompt_body: string | null } | null = null;
  let manifest: ReturnType<typeof parseListingEnv> extends infer _ ? import("@/lib/agent/schema").AgentManifest | undefined : never = undefined;
  let parsedEnv: ReturnType<typeof parseListingEnv> = null;
  if (isTestRun) {
    const embedded = (run.inputs as Record<string, unknown> | null)?.__manifest;
    if (typeof embedded === "string") {
      const parsedManifest = AgentManifestSchema.safeParse(JSON.parse(embedded));
      if (parsedManifest.success) manifest = parsedManifest.data;
    }
  } else {
    const { data: v } = await admin
      .from("listing_versions")
      .select("env, prompt_body")
      .eq("id", run.version_id ?? "")
      .single();
    version = v;
    parsedEnv = parseListingEnv(v?.env, v?.prompt_body);
    manifest = parsedEnv?.manifest;
  }
  if (!manifest) {
    return NextResponse.json(
      { error: "Manifeste introuvable pour ce run." },
      { status: 400 },
    );
  }

  const { data: listing } = run.listing_id
    ? await admin
        .from("listings")
        .select("id, creator_id, status, current_version_id")
        .eq("id", run.listing_id)
        .single()
    : { data: null };
  // Un run de test appartient à son lanceur : pleine liberté de correction.
  const isCreator = isTestRun ? run.user_id === user.id : !!listing && listing.creator_id === user.id;

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

  // Schémas RÉELS des outils en échec — l'IA choisit dans les enums au lieu
  // de deviner (design_type & co).
  const toolSchemas: import("@/lib/agent/auto-fix-run").ToolSchemaContext[] = [];
  try {
    const { listComposioTools } = await import("@/lib/composio/catalog");
    const { toComposioToolkitSlug } = await import("@/lib/connectors/resolve-id");
    const seen = new Set<string>();
    for (const f of failed) {
      const slug: string | null = f.actionSlug;
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const toolkit = toComposioToolkitSlug(
        (f.connector as string | null) ?? slug.split(/[._]/)[0]?.toLowerCase() ?? "",
      );
      const tools = await listComposioTools(toolkit).catch(() => []);
      const entry = tools.find(
        (t) => t.slug === slug || t.slug.toLowerCase().includes(slug.split(".").pop() ?? ""),
      );
      if (entry) {
        toolSchemas.push({
          action: slug,
          inputs: entry.inputs.map((i) => ({
            key: i.key,
            label: i.label,
            required: i.required,
            enumValues: i.enumValues,
            defaultValue: i.defaultValue,
          })),
        });
      }
    }
  } catch {
    // best-effort — l'IA travaille sans schémas si le catalogue est indisponible
  }

  let ai;
  try {
    ai = await autoFixRun({
      steps: manifest.steps,
      failed,
      fixes,
      apiKey: keyResult.apiKey,
      resolved: keyResult.resolved,
      toolSchemas,
      answers: body.answers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de l'auto-correction IA" },
      { status: 500 },
    );
  }

  let applied = false;
  let relaunchedRunId: string | null = null;
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

        if (isTestRun) {
          // Run de test : on relance directement un nouveau run avec le
          // manifeste corrigé embarqué (l'IA répare ET relance).
          const cleanInputs = Object.fromEntries(
            Object.entries((run.inputs as Record<string, string>) ?? {}).filter(
              ([k]) => !k.startsWith("__"),
            ),
          );
          const { data: newRun } = await admin
            .from("listing_agent_runs")
            .insert({
              user_id: run.user_id,
              listing_id: run.listing_id ?? null,
              status: "pending",
              dry_run: false,
              inputs: { ...cleanInputs, __manifest: JSON.stringify(rebuilt), __qa: (run.inputs as Record<string, string> | null)?.__qa },
            })
            .select("id")
            .single();
          if (newRun?.id) {
            const { processPendingAgentRuns } = await import("@/lib/worker/process-pending-runs");
            void processPendingAgentRuns(1, { runId: newRun.id }).catch(() => undefined);
            applied = true;
            relaunchedRunId = newRun.id;
          }
        } else if (listing?.status === "published") {
          const { data: currentVersion } = await admin
            .from("listing_versions")
            .select("semver")
            .eq("id", listing.current_version_id ?? run.version_id ?? "")
            .single();
          const oldSemver = (currentVersion as any)?.semver ?? "1.0.0";
          const parts = String(oldSemver).split(".").map(Number);
          const newSemver = `${parts[0]}.${(parts[1] ?? 0) + 1}.0`;

          const { data: newVersion } = await admin
            .from("listing_versions")
            .insert({
              listing_id: run.listing_id ?? "",
              semver: newSemver,
              changelog: `Auto-correction IA ${newSemver}`,
              prompt_body: version?.prompt_body ?? null,
              env: envPayload,
              contract,
            })
            .select("id")
            .single();

          if (newVersion?.id) {
            await admin
              .from("listings")
              .update({ current_version_id: newVersion.id })
              .eq("id", run.listing_id ?? "");
            appliedVersionId = newVersion.id;
            applied = true;
          }
        } else {
          await admin
            .from("listing_versions")
            .update({ env: envPayload, contract })
            .eq("id", run.version_id ?? "");
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
    questions: ai.questions,
    autoFixable: ai.autoFixable,
    applied,
    blockedReason,
    relaunchedRunId,
    relaunch: {
      listingId: run.listing_id,
      versionId: appliedVersionId,
      inputs: (run.inputs ?? {}) as Record<string, string>,
    },
  });
}
