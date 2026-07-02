/**
 * app/api/cron/tick/route.ts
 * ────────────────────────────────────────────────────────────
 * Point d'entrée du cron. Render appelle cette URL toutes les heures.
 *
 * Sécurité : protégé par CRON_SECRET. Sans le bon header, 401.
 *
 * Logique : pour chaque agent dont le planning correspond à
 * maintenant (jour + heure), déclenche un run.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startAgentRun } from "@/lib/agents/runner";
import type { AgentSlug } from "@/lib/agents/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max

export async function GET(req: NextRequest) {
  // ── Sécurité : vérifie le secret cron ──
  const auth = req.headers.get("authorization");
  // Fail-closed : sans CRON_SECRET configuré, « Bearer undefined » passerait.
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const sb = createAdminClient();

  // ── TOUJOURS : file marketplace + reaper (filet de sécurité si le worker
  // dédié est down). Le coupe-circuit budget ne concerne QUE les agents ops
  // admin ci-dessous — avant, il court-circuitait toute la route et les runs
  // utilisateurs restaient « Démarrage… » pour toujours.
  //
  // ⚠️ Exécution via after() : si on traite les runs DANS la requête, le
  // proxy coupe à ~3 min sans réponse et Next 16 avorte le handler → agents
  // tués en plein vol (constaté : morts à exactement 180 s). after() détache
  // le travail de la durée de vie de la requête.
  const pendingProcessed = "queued (after)";
  const reaped = "queued (after)";
  after(async () => {
    const { processPendingAgentRuns } = await import("@/lib/worker/process-pending-runs");
    await processPendingAgentRuns(5).catch((e) =>
      console.error("[cron:tick] pending runs failed:", e),
    );
    const { reapStalePendingRuns, reapStaleRunningRuns } = await import("@/lib/worker/reap-stale-runs");
    await reapStalePendingRuns().catch(() => 0);
    await reapStaleRunningRuns().catch(() => 0);
  });

  // ── Coupe-circuit des agents OPS ADMIN uniquement ──
  const { data: budget } = await sb.from("agent_budget").select("is_paused").eq("id", 1).single();
  if (budget?.is_paused) {
    return NextResponse.json({
      pendingProcessed,
      reaped,
      skippedAgents: "Budget agents admin en pause (coupe-circuit).",
    });
  }

  // ── Heure et jour courants (timezone Europe/Paris) ──
  const now = new Date();
  const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const day = paris.getDay(); // 0=dim … 6=sam
  const hour = paris.getHours(); // 0-23

  // ── Plannings actifs qui correspondent à maintenant ──
  const { data: schedules } = await sb
    .from("agent_schedules")
    .select("agent_slug, days, hours, is_enabled")
    .eq("is_enabled", true);

  const due = (schedules ?? []).filter(
    (s) => s.days.includes(day) && s.hours.includes(hour)
  );

  if (due.length === 0) {
    return NextResponse.json({
      ran: [],
      pendingProcessed,
      reaped,
      message: `Rien de planifié à ${hour}h (jour ${day}). ${pendingProcessed} run(s) marketplace traité(s).`,
    });
  }

  // ── Lance chaque agent dû ──
  const results: { agent: string; ok: boolean; detail: string }[] = [];
  for (const s of due) {
    const r = await startAgentRun(s.agent_slug as AgentSlug, "cron");
    results.push({
      agent: s.agent_slug,
      ok: r.ok,
      detail: r.ok ? r.result.summary : r.reason,
    });
  }

  return NextResponse.json({ ran: results, at: `${hour}h jour ${day}`, pendingProcessed, reaped });
}
