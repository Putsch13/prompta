import { validateWorkerEnv } from "@/lib/env/worker";
import { processPendingAgentRuns } from "@/lib/worker/process-pending-runs";
import { reapStaleRunningRuns, reapStalePendingRuns } from "@/lib/worker/reap-stale-runs";

const POLL_MS = 3000;
const REAP_INTERVAL_MS = 60 * 1000;

/**
 * Borne de budget par PASSE du worker dédié (pas une limite de mission).
 *
 * Le worker n'a aucune contrainte HTTP, d'où l'absence de borne historique —
 * mais la reprise après timeout de `process-pending-runs` est conditionnée à
 * la présence de `maxRuntimeMs` : sans elle, un run qui dépassait le
 * `timeout_ms` de son manifeste (300 s, 600 s avec pilotage) échouait
 * DÉFINITIVEMENT ici, alors que le même run lancé depuis une route web était
 * repris deux fois. Le worker « sans contrainte » était donc le chemin le plus
 * fragile. En la posant, le run est remis en pending et repris à l'étape
 * suivante (2 reprises max, étape interrompue sans effet de bord possible).
 */
const WORKER_MAX_RUNTIME_MS = 15 * 60 * 1000;

async function boot() {
  console.info("[worker] booting...");
  const env = validateWorkerEnv();

  if (!env.ok) {
    console.error("[worker] FATAL: cannot start — missing env vars:", env.missing);
    process.exit(1);
  }

  console.info("[worker] boot OK — starting poll loop");
}

async function loop() {
  await boot();

  let lastReap = 0;

  while (true) {
    try {
      const now = Date.now();

      if (now - lastReap > REAP_INTERVAL_MS) {
        const reapedRunning = await reapStaleRunningRuns();
        const reapedPending = await reapStalePendingRuns();
        if (reapedRunning + reapedPending > 0) {
          console.warn("[worker:reap] cleaned stale runs:", { running: reapedRunning, pending: reapedPending });
        }
        lastReap = now;
      }

      const n = await processPendingAgentRuns(3, { maxRuntimeMs: WORKER_MAX_RUNTIME_MS });
      if (n > 0) {
        console.info("[worker] processed runs:", n);
      }
    } catch (err) {
      console.error("[worker] poll error:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop();
