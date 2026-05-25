import { createAdminClient } from "@/lib/supabase/admin";
import { processPendingAgentRuns } from "@/lib/worker/process-pending-runs";

const POLL_MS = 3000;

async function loop() {
  console.log("[worker] démarré — polling listing_agent_runs pending");
  while (true) {
    try {
      const n = await processPendingAgentRuns(3);
      if (n > 0) console.log(`[worker] ${n} run(s) traité(s)`);
    } catch (err) {
      console.error("[worker] erreur:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop();
