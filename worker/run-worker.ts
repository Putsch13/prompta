import { validateWorkerEnv } from "@/lib/env/worker";
import { processPendingAgentRuns } from "@/lib/worker/process-pending-runs";
import { reapStaleRunningRuns } from "@/lib/worker/reap-stale-runs";

const POLL_MS = 3000;
const REAP_INTERVAL_MS = 60 * 1000;

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
        const reaped = await reapStaleRunningRuns();
        if (reaped > 0) {
          console.warn("[worker:reap] cleaned stale runs:", reaped);
        }
        lastReap = now;
      }

      const n = await processPendingAgentRuns(3);
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
