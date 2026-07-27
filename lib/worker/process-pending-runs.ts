import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/orchestrator";
import { parseListingEnv } from "@/lib/agent/env";
import { AgentManifestSchema } from "@/lib/agent/schema";
import {
  ensureApprovalGuards,
  hasApprovalGuardStamp,
  shouldApplyApprovalGuards,
  APPROVAL_GUARD_STAMP_KEY,
  APPROVAL_GUARD_STAMP_VALUE,
} from "@/lib/agent/approval-guards";
import type { Database, Json } from "@/lib/types.db";

type AgentRunUpdate = Database["public"]["Tables"]["listing_agent_runs"]["Update"];

/**
 * Remise en file (status pending + fenêtre de fraîcheur) tolérante au drift
 * 0051 : si la colonne queued_at n'existe pas encore en prod, l'update entier
 * était rejeté SANS être vérifié — le run restait « running » fantôme jusqu'au
 * reaper au lieu de repartir.
 */
async function requeueRunTolerant(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  row: AgentRunUpdate,
): Promise<void> {
  const { error } = await admin
    .from("listing_agent_runs")
    .update({ ...row, status: "pending", queued_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) {
    console.error("[worker] requeue avec queued_at refusé (appliquer 0051), retry sans:", error.message);
    await admin
      .from("listing_agent_runs")
      .update({ ...row, status: "pending" })
      .eq("id", runId);
  }
}
import {
  resolveAgentRunKeys,
  settleAgentRunCredits,
  releaseAgentRunCredits,
} from "@/lib/billing/agent-run-billing";
import { applyFreeTierLimits } from "@/lib/billing/free-tier";
import { FREE_RUN_MAX_TOKENS } from "@/lib/billing/credits";
import { randomUUID } from "crypto";
import { checkConnectorHealth, blockingHealthIssues } from "@/lib/connectors/connection-health";
import { runnerRequiredConnectors } from "@/lib/agent/run-connectors";
import { captureError } from "@/lib/observability";

const HEARTBEAT_INTERVAL_MS = 5_000;

function workerId(): string {
  const hostname = typeof process !== "undefined" ? (process.env.HOSTNAME ?? process.env.RENDER_INSTANCE_ID ?? "local") : "unknown";
  return `${hostname}-${randomUUID().slice(0, 8)}`;
}

function parseResumeOutputs(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function processPendingAgentRuns(
  limit = 3,
  opts?: {
    runId?: string;
    /**
     * Budget temps de la PASSE appelante (pour une route serverless :
     * STRICTEMENT sous son maxDuration) — transmis à l'orchestrateur pour
     * borner le timeout global du run, et surtout condition d'activation de la
     * reprise après timeout (plus bas). Le worker dédié en pose une, large :
     * sans elle un run trop long échouait définitivement au lieu d'être repris.
     */
    maxRuntimeMs?: number;
  },
): Promise<number> {
  const admin = createAdminClient();
  const wid = workerId();

  // Les runs d'aperçu (builder, version_id null) embarquent leur manifeste
  // dans inputs.__manifest : le worker les traite comme les autres (console
  // live, reprise après approbation depuis /dashboard/validations…).
  // `opts.runId` = kick CIBLÉ après création/approbation : on traite CE run,
  // pas le plus ancien de la file (sinon un zombie passait devant).
  let query = admin
    .from("listing_agent_runs")
    .select("id, user_id, listing_id, version_id, inputs, dry_run, used_credits, credit_hold_estimate_cents, resume_from_step, output, steps_completed")
    .eq("status", "pending")
    .eq("cancel_requested", false);
  if (opts?.runId) query = query.eq("id", opts.runId);

  const { data: jobs } = await query
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;

  for (const job of jobs ?? []) {
    const startMs = Date.now();
    const resumeFromStep = typeof job.resume_from_step === "number" ? job.resume_from_step : 0;
    const resumeOutputs = parseResumeOutputs(job.output);

    console.info("[worker] claiming run", {
      runId: job.id,
      listingId: job.listing_id,
      worker: wid,
      resumeFromStep,
    });

    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claimed } = await admin
      .from("listing_agent_runs")
      .update({
        status: "running",
        started_at: now,
        heartbeat_at: now,
        claimed_by: wid,
        resume_from_step: null,
      })
      .eq("id", job.id)
      .eq("status", "pending")
      .eq("cancel_requested", false)
      .select("id, user_id, listing_id, version_id, inputs, dry_run, used_credits, credit_hold_estimate_cents")
      .maybeSingle();

    if (!claimed) {
      console.info("[worker] run already claimed by another worker", { runId: job.id });
      continue;
    }

    console.info("[worker] started run", { runId: claimed.id, listingId: claimed.listing_id, worker: wid });

    try {
      const isPreview = !claimed.version_id;

      const { data: listing } = claimed.listing_id
        ? await admin
            .from("listings")
            .select("price_cents, creator_id")
            .eq("id", claimed.listing_id)
            .single()
        : { data: null };

      let manifestRaw: unknown;
      let frozenContract: import("@/lib/agent/contract").AgentContract | null = null;

      if (isPreview) {
        // Run de test du builder : le manifeste voyage dans le run lui-même.
        const embedded = (claimed.inputs as Record<string, unknown> | null)?.__manifest;
        if (typeof embedded !== "string") {
          throw new Error(
            "Run de test sans manifeste embarqué — relancez le test depuis le builder.",
          );
        }
        manifestRaw = JSON.parse(embedded);
      } else {
        const { data: version } = await admin
          .from("listing_versions")
          .select("env, prompt_body, contract")
          .eq("id", claimed.version_id ?? "")
          .single();

        const parsed = parseListingEnv(version?.env, version?.prompt_body);
        if (!parsed) throw new Error("Manifeste agent manquant");
        manifestRaw = parsed.manifest;

        // P1.6 + P3.3 : si la version a un contrat figé, on le réutilise tel quel
        // pour garantir qu'une reprise (worker) lit la même interface que le run initial.
        frozenContract = (version?.contract ?? null) as
          | import("@/lib/agent/contract").AgentContract
          | null;
      }

      const manifestParsed = AgentManifestSchema.safeParse(manifestRaw);
      if (!manifestParsed.success) throw new Error("Manifeste agent invalide");

      // Garde-fous d'approbation (parité avec le flux extension) : toute
      // écriture sensible est précédée d'une validation humaine, quel que soit
      // le chemin qui a créé le run (API, planifié, webhook, test builder).
      // Idempotent pour un manifeste déjà gardé (extension, replan) — jamais
      // deux approbations pour la même action. Reprise d'un run legacy NON
      // tamponné __guarded : on reste sur le manifeste brut, re-garder
      // décalerait resume_from_step et ferait rejouer des actions déjà faites.
      const preGuardInputs = (claimed.inputs as Record<string, unknown> | null) ?? {};
      const guardStamped = hasApprovalGuardStamp(preGuardInputs);
      let manifest = manifestParsed.data;
      if (shouldApplyApprovalGuards(resumeFromStep, guardStamped)) {
        manifest = ensureApprovalGuards(manifest);
        if (!guardStamped) {
          // Tampon persisté AVANT exécution : les index d'étapes de ce run
          // sont en coordonnées gardées — reprises et relectures du manifeste
          // (approvalStepOutputKey, planned_steps) re-gardent avant d'indexer.
          const stampedInputs = {
            ...preGuardInputs,
            [APPROVAL_GUARD_STAMP_KEY]: APPROVAL_GUARD_STAMP_VALUE,
          };
          await admin
            .from("listing_agent_runs")
            .update({ inputs: stampedInputs as Json })
            .eq("id", claimed.id);
          claimed.inputs = stampedInputs as Json;
        }
      }

      // Source de vérité unique : mêmes connecteurs requis que la route de run
      // (exclut les étapes sharedEnv du créateur pour un run d'abonné).
      const requiredConnectors = runnerRequiredConnectors(manifest, {
        userId: claimed.user_id,
        creatorId: listing?.creator_id ?? undefined,
      });
      if (requiredConnectors.length > 0 && !claimed.dry_run) {
        const healthIssues = await checkConnectorHealth(
          claimed.user_id,
          requiredConnectors,
        );
        // Seuls les blocages réels (pas de connexion / token absent ou expiré)
        // arrêtent le run. Les signaux scope/identité non bloquants laissent
        // l'exécution tenter l'accès (l'erreur réelle sera alors diagnostiquée).
        const blockers = blockingHealthIssues(healthIssues);
        if (blockers.length > 0) {
          const msg = blockers.map((i) => i.message).join("\n");
          throw new Error(`Connecteurs indisponibles :\n${msg}`);
        }
      }

      // FACTURATION (post-marketplace) : la propriété n'exonère pas.
      // used_credits === null  → run né ici (test builder, planifié, webhook,
      //   QA) : le worker décide — BYOK = gratuit, clés plateforme = hold de
      //   crédits (ou quota gratuit), admin illimité = exempté.
      // used_credits === false → déjà autorisé par l'API (BYOK/quota) : on ne
      //   résout que les clés, aucune re-facturation.
      // used_credits === true  → hold déjà posé par l'API : settle en sortie.
      const alreadyAuthorized = claimed.used_credits !== null && claimed.used_credits !== undefined;
      const jobInputs = (claimed.inputs as Record<string, string> | null) ?? {};
      // Run autorisé par l'API sur QUOTA GRATUIT : le marqueur __free_quota
      // (posé par run/agent, ou ci-dessous) impose de re-brider le manifeste —
      // le worker relit la version publiée, pas le manifeste bridé du run initial.
      const authorizedFreeQuota = alreadyAuthorized && jobInputs.__free_quota === "1";
      let billing: Awaited<ReturnType<typeof resolveAgentRunKeys>>;
      try {
        billing = await resolveAgentRunKeys(
          claimed.user_id,
          authorizedFreeQuota ? applyFreeTierLimits(manifest) : manifest,
          alreadyAuthorized, // true = clés seulement, pas de contrôle crédits
          true,
          { consumeFreeQuota: !alreadyAuthorized }
        );
      } catch (billErr) {
        const msg = billErr instanceof Error ? billErr.message : "Crédits insuffisants";
        await admin
          .from("listing_agent_runs")
          .update({ status: "failed", error_message: msg })
          .eq("id", claimed.id);
        continue;
      }

      if (!alreadyAuthorized) {
        if (billing.usedCredits) {
          const { holdAgentRunCredits } = await import("@/lib/billing/agent-run-billing");
          const held = await holdAgentRunCredits(claimed.user_id, claimed.id, billing.estimatedMax);
          if (!held) {
            await admin
              .from("listing_agent_runs")
              .update({
                status: "failed",
                error_message: "Crédits insuffisants — recharge tes crédits ou configure tes clés BYOK.",
              })
              .eq("id", claimed.id);
            continue;
          }
          await admin
            .from("listing_agent_runs")
            .update({ used_credits: true, credit_hold_estimate_cents: billing.estimatedMax })
            .eq("id", claimed.id);
          claimed.used_credits = true;
          claimed.credit_hold_estimate_cents = billing.estimatedMax;
        } else {
          // Autorisé sans crédits (BYOK complet, quota gratuit ou admin).
          // Le quota gratuit est marqué dans les inputs : une reprise
          // (approbation, crash) devra re-brider le manifeste comme ce run.
          // `claimed.inputs` est synchronisé aussi : le replan (extension)
          // réécrit inputs depuis cette copie mémoire — sans elle, le flag
          // sauterait et la reprise repartirait sans bridage.
          if (billing.usedFreeQuota) {
            claimed.inputs = { ...jobInputs, __free_quota: "1" };
          }
          await admin
            .from("listing_agent_runs")
            .update({
              used_credits: false,
              ...(billing.usedFreeQuota ? { inputs: claimed.inputs } : {}),
            })
            .eq("id", claimed.id);
          claimed.used_credits = false;
        }
      }

      // Les clés techniques (__manifest…) ne sont pas des entrées d'agent.
      const inputs = Object.fromEntries(
        Object.entries((claimed.inputs as Record<string, string>) ?? {}).filter(
          ([k]) => !k.startsWith("__"),
        ),
      );
      const { buildRunResourcesFromInputs } = await import("@/lib/agent/build-run-resources");
      const { cleanInputs, resources } = buildRunResourcesFromInputs(manifest, inputs);

      const heartbeatTimer = setInterval(async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await admin
            .from("listing_agent_runs")
            .update({ heartbeat_at: new Date().toISOString() })
            .eq("id", claimed.id);
        } catch {
          // heartbeat failure is non-fatal
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Manifeste EFFECTIF : bridé free-tier si le run passe (ou est passé)
      // sur quota gratuit — modèle imposé + plafond de tokens par appel.
      const freeQuotaRun = authorizedFreeQuota || billing.usedFreeQuota;
      let result;
      try {
        result = await runAgent(billing.manifest, {
          userId: claimed.user_id,
          listingId: claimed.listing_id ?? "",
          creatorId: listing?.creator_id,
          inputs: cleanInputs,
          resources,
          apiKeys: billing.apiKeys,
          platformProviders: billing.platformProviders,
          runId: claimed.id,
          dryRun: claimed.dry_run ?? false,
          resumeFromStep,
          resumeOutputs,
          ...(freeQuotaRun ? { llmMaxTokensCap: FREE_RUN_MAX_TOKENS } : {}),
          ...(frozenContract ? { contract: frozenContract } : {}),
          ...(opts?.maxRuntimeMs ? { maxRuntimeMs: opts.maxRuntimeMs } : {}),
          onProgress: async (stepsCompleted, partialOutput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await admin
              .from("listing_agent_runs")
              .update({
                steps_completed: stepsCompleted,
                heartbeat_at: new Date().toISOString(),
                ...(partialOutput ? { output: partialOutput } : {}),
              })
              .eq("id", claimed.id);
          },
        });
      } finally {
        clearInterval(heartbeatTimer);
      }

      // ── Reprise après timeout de BUDGET ────────────────────────────────
      // maxRuntimeMs borne la PASSE, pas la mission : plutôt que d'échouer, on
      // remet le run en pending pour qu'une passe suivante (worker dédié, ou
      // tick) le reprenne où il en était. Sûreté : l'étape interrompue ne doit pas avoir d'effet de bord
      // possible (action/browser — y compris dans un parallel — risquent le
      // rejeu : l'appel orphelin du Promise.race peut encore aboutir), et 2
      // reprises max (un run qui ne finit jamais une étape en 280 s ne
      // progressera pas plus à la 3ᵉ).
      if (
        result.status === "failed" &&
        opts?.maxRuntimeMs &&
        !claimed.dry_run &&
        /Timeout agent dépassé/i.test(result.error ?? "")
      ) {
        const rawInputs = (claimed.inputs as Record<string, string>) ?? {};
        const budgetRequeues = Number(rawInputs.__budget_requeues ?? 0);
        const interrupted = manifest.steps[result.stepsCompleted];
        const interruptedSafe =
          !interrupted ||
          (interrupted.type !== "action" &&
            interrupted.type !== "browser" &&
            !(
              interrupted.type === "parallel" &&
              interrupted.branches.some((b) =>
                b.steps.some((s) => s.type === "action" || s.type === "browser"),
              )
            ));
        if (budgetRequeues < 2 && interruptedSafe) {
          await requeueRunTolerant(admin, claimed.id, {
            resume_from_step: result.stepsCompleted,
            steps_completed: result.stepsCompleted,
            output: result.output as Json,
            error_message: null,
            inputs: { ...rawInputs, __budget_requeues: String(budgetRequeues + 1) } as Json,
            heartbeat_at: new Date().toISOString(),
          });
          console.info("[worker] budget timeout — requeued pour le worker dédié", {
            runId: claimed.id,
            fromStep: result.stepsCompleted,
            requeue: budgetRequeues + 1,
          });
          // Hold conservé : settle/release au dénouement final, comme replan.
          processed++;
          continue;
        }
      }

      // ── Re-planification (Prompta partout) ─────────────────────────────
      // Une étape a échoué sur un run de l'extension : avant d'abandonner, le
      // réparateur propose une nouvelle suite de plan (2 tentatives max). En
      // cas de succès le run repart en pending avec le manifeste réparé — le
      // hold de crédits reste posé (settle/release au dénouement final).
      if (result.status === "failed" && isPreview && !claimed.dry_run) {
        const rawInputs = (claimed.inputs as Record<string, string>) ?? {};
        const repairsDone = Number(rawInputs.__repairs ?? 0);
        // Deux cas où l'on NE répare PAS : décision humaine (refus/annulation),
        // et étape échouée à effet de bord possible — pilotage navigateur, ou
        // bloc PARALLEL contenant des branches action/browser : allSettled a
        // pu exécuter des écritures dans d'autres branches avant l'échec, un
        // replan repartirait de cette étape et les rejouerait (double envoi).
        const userIntentFailure =
          /annulée par l'utilisateur|Pilotage interrompu/i.test(result.error ?? "");
        const failedStep = manifest.steps[result.stepsCompleted];
        const failedStepHasSideEffects =
          failedStep?.type === "browser" ||
          (failedStep?.type === "parallel" &&
            failedStep.branches.some((b) =>
              b.steps.some((s) => s.type === "action" || s.type === "browser"),
            ));
        if (rawInputs.__source === "extension" && repairsDone < 2 && result.error && !userIntentFailure && !failedStepHasSideEffects) {
          try {
            const { replanAfterFailure, MAX_REPAIRS_PER_RUN } = await import("@/lib/extension/replan");
            if (repairsDone < MAX_REPAIRS_PER_RUN) {
              const { listUserConnections } = await import("@/lib/connections");
              const connections = await listUserConnections(claimed.user_id);
              const usable = new Set(connections.filter((c) => c.usable).map((c) => c.connectorId));
              const replan = await replanAfterFailure({
                goal: rawInputs.__goal ?? "",
                manifest,
                failedStepIndex: result.stepsCompleted,
                errorMessage: result.error,
                // Le réparateur doit voir TOUTES les variables résolubles au
                // runtime : les sorties d'étapes ET les entrées injectées
                // (page_active, tab_N, file_content…) — sans elles il
                // « réparait » une mission écran-dépendante sans savoir que
                // l'écran est disponible, et proposait une suite qui re-merde.
                outputs: { ...cleanInputs, ...result.output },
                modelId: rawInputs.__model ?? "gpt-5.4-mini",
                apiKeys: billing.apiKeys,
                usableConnectors: usable,
              });
              // Facturation du replan : l'appel LLM de réparation tourne sur
              // les clés du run — s'il est en crédits, on le débite (markup).
              if (replan && claimed.used_credits) {
                const { debitPlatformUsage } = await import("@/lib/credits");
                const planChars =
                  (rawInputs.__goal?.length ?? 0) +
                  Math.min(JSON.stringify(manifest).length, 20_000) +
                  2_000;
                await debitPlatformUsage(
                  claimed.user_id,
                  // ~4 car./token, prix fallback prudent appliqué dans le débit via markup
                  ((planChars / 4) * 300 + 500 * 1200) / 1_000_000,
                  "Réparation de plan (replan)",
                  claimed.id,
                );
              }
              if (replan?.kind === "repaired") {
                // Le plan réparé peut être plus lourd que le hold initial :
                // top-up best-effort (jamais bloquant pour un run en vol).
                if (claimed.used_credits && claimed.credit_hold_estimate_cents != null) {
                  try {
                    const { estimateMaxCostForManifest } = await import("@/lib/billing/estimate-manifest-cost");
                    const { holdAgentRunCredits } = await import("@/lib/billing/agent-run-billing");
                    const newEstimate = estimateMaxCostForManifest(replan.manifest);
                    const currentHold = Number(claimed.credit_hold_estimate_cents);
                    if (newEstimate > currentHold) {
                      const topped = await holdAgentRunCredits(
                        claimed.user_id,
                        claimed.id,
                        newEstimate - currentHold,
                      );
                      if (topped) {
                        await admin
                          .from("listing_agent_runs")
                          .update({ credit_hold_estimate_cents: newEstimate })
                          .eq("id", claimed.id);
                        claimed.credit_hold_estimate_cents = newEstimate;
                      }
                    }
                  } catch (e) {
                    console.warn("[worker] hold top-up after replan failed:", e);
                  }
                }
                await requeueRunTolerant(admin, claimed.id, {
                  resume_from_step: result.stepsCompleted,
                  steps_completed: result.stepsCompleted,
                  output: result.output as Json,
                  error_message: null,
                  inputs: {
                    ...rawInputs,
                    __manifest: JSON.stringify(replan.manifest),
                    __repairs: String(repairsDone + 1),
                  } as Json,
                  heartbeat_at: new Date().toISOString(),
                });
                console.info("[worker] run repaired, resuming", {
                  runId: claimed.id,
                  fromStep: result.stepsCompleted,
                  repair: repairsDone + 1,
                });
                // Reprise immédiate ciblée (profondeur bornée par __repairs).
                // Le budget temps du point d'entrée est DÉCRÉMENTÉ du temps
                // déjà consommé (run initial + appel de réparation) : repartir
                // avec le budget intact faisait croire à l'orchestrateur qu'il
                // avait p. ex. 540 s alors que la plateforme tuait la fonction
                // bien avant — le run réparé restait coincé « running ».
                const elapsedMs = Date.now() - startMs;
                const remainingMs = opts?.maxRuntimeMs
                  ? opts.maxRuntimeMs - elapsedMs - 10_000
                  : undefined;
                if (remainingMs !== undefined && remainingMs < 30_000) {
                  // Plus assez de fenêtre : le run est déjà pending re-timestampé,
                  // le worker dédié ou le prochain tick le reprendra proprement.
                  console.info("[worker] fenêtre serverless épuisée — reprise laissée au worker dédié", {
                    runId: claimed.id,
                    elapsedMs,
                  });
                } else {
                  await processPendingAgentRuns(1, {
                    runId: claimed.id,
                    ...(remainingMs !== undefined ? { maxRuntimeMs: remainingMs } : {}),
                  });
                }
                processed++;
                continue;
              }
              if (replan?.kind === "abort") {
                result.error = `${replan.reason}\n(Erreur d'origine : ${result.error.slice(0, 200)})`;
              }
            }
          } catch (replanErr) {
            console.warn("[worker] replan failed:", replanErr instanceof Error ? replanErr.message : replanErr);
          }
        }
      }

      if (claimed.used_credits && claimed.credit_hold_estimate_cents != null) {
        if (result.status === "completed" && result.usage) {
          await settleAgentRunCredits(
            claimed.user_id,
            claimed.id,
            { steps: result.usage },
            Number(claimed.credit_hold_estimate_cents)
          );
        } else if (result.status !== "awaiting_approval") {
          await releaseAgentRunCredits(
            claimed.user_id,
            claimed.id,
            Number(claimed.credit_hold_estimate_cents)
          );
        }
      }

      const { error: finalErr } = await admin
        .from("listing_agent_runs")
        .update({
          status: result.status,
          steps_completed: result.stepsCompleted,
          output: result.output,
          // En attente d'approbation = pas une erreur : on n'enregistre pas de
          // message d'erreur (sinon le run paraît échoué dans l'UI).
          error_message: result.status === "awaiting_approval" ? null : (result.error ?? null),
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);

      if (finalErr) {
        // Drift de contrainte statut (migration 0045 non appliquée) : on
        // sauvegarde au moins la progression avec un statut accepté — la
        // pause d'approbation reste dérivable de la ligne agent_approvals.
        console.error("[worker] update final refusé, fallback:", finalErr.message);
        await admin
          .from("listing_agent_runs")
          .update({
            status: result.status === "awaiting_approval" || result.status === "cancelled"
              ? "running"
              : result.status,
            steps_completed: result.stepsCompleted,
            output: result.output,
            error_message: result.error ?? null,
            heartbeat_at: new Date().toISOString(),
          })
          .eq("id", claimed.id);
      }

      const durationMs = Date.now() - startMs;
      console.info("[worker] completed run", {
        runId: claimed.id,
        status: result.status,
        stepsCompleted: result.stepsCompleted,
        durationMs,
      });

      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur worker";
      const durationMs = Date.now() - startMs;

      void captureError(err, {
        scope: "worker.run",
        runId: claimed.id,
        listingId: claimed.listing_id,
        durationMs,
      });

      if (claimed.used_credits && claimed.credit_hold_estimate_cents != null) {
        await releaseAgentRunCredits(
          claimed.user_id,
          claimed.id,
          Number(claimed.credit_hold_estimate_cents)
        ).catch((e) => console.error("[worker] release hold failed", { runId: claimed.id, err: e }));
      }

      await admin
        .from("listing_agent_runs")
        .update({
          status: "failed",
          error_message: message,
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);
      processed++;
    }
  }

  return processed;
}
