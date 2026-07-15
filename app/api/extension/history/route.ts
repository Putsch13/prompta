import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractRunAnswer } from "@/lib/extension/instant-agent";

export const dynamic = "force-dynamic";

/**
 * Fil de conversation de l'assistant : les dernières missions lancées depuis
 * l'extension / la barre (source=extension), avec leur statut vivant.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: runs } = await admin
    .from("listing_agent_runs")
    .select("id, status, steps_completed, error_message, created_at, inputs, output")
    .eq("user_id", user.id)
    .filter("inputs->>__source", "eq", "extension")
    .order("created_at", { ascending: false })
    .limit(20);

  const ids = (runs ?? []).map((r) => r.id);
  const awaiting = new Set<string>();
  if (ids.length > 0) {
    const { data: pend } = await admin
      .from("agent_approvals")
      .select("run_id")
      .in("run_id", ids)
      .eq("status", "pending");
    for (const a of pend ?? []) awaiting.add(a.run_id);
  }

  const items = (runs ?? []).map((r) => {
    const inputs = (r.inputs ?? {}) as Record<string, string>;
    const status =
      awaiting.has(r.id) && ["running", "pending", "awaiting_approval"].includes(r.status)
        ? "awaiting_approval"
        : r.status;
    return {
      runId: r.id,
      goal: inputs.__goal ?? "",
      title: inputs.__title ?? inputs.__goal ?? "Mission",
      model: inputs.__model ?? null,
      sourceUrl: inputs.__source_url ?? null,
      // Réponse persistée (missions simples) : le fil de conversation la réaffiche.
      answer: status === "completed" ? (extractRunAnswer(r.output)?.slice(0, 4000) ?? null) : null,
      status,
      stepsCompleted: r.steps_completed ?? 0,
      error: r.error_message,
      createdAt: r.created_at,
    };
  });

  return NextResponse.json({ items });
}
