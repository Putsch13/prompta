/**
 * app/admin/agents/page.tsx
 * ────────────────────────────────────────────────────────────
 * Centre de contrôle des agents (Server Component).
 * Charge les données puis délègue l'interactivité au Client Component.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import AgentsControlPanel from "./AgentsControlPanel";

export const dynamic = "force-dynamic";

export default async function AdminAgentsPage() {
  const sb = createAdminClient();

  const [{ data: defs }, { data: schedules }, { data: outputs }, { data: budget }] =
    await Promise.all([
      sb.from("agent_definitions").select("*").order("name"),
      sb.from("agent_schedules").select("*"),
      sb
        .from("agent_outputs")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50),
      sb.from("agent_budget").select("*").eq("id", 1).single(),
    ]);

  return (
    <AgentsControlPanel
      definitions={defs ?? []}
      schedules={schedules ?? []}
      pendingOutputs={outputs ?? []}
      budget={budget}
    />
  );
}
