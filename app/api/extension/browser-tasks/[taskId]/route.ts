import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types.db";

export const dynamic = "force-dynamic";

/**
 * Réponse de l'extension à une tâche de pilotage navigateur : le résultat de
 * l'action exécutée dans l'onglet (snapshot frais, refus utilisateur, erreur).
 * Seul le propriétaire du run peut répondre.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    ok?: boolean;
    snapshot?: {
      url?: string;
      title?: string;
      text?: string;
      elements?: unknown[];
      scroll?: { y?: number; max?: number };
    };
    declined?: boolean;
    error?: string;
  } | null;
  if (!body || typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: task } = await admin
    .from("agent_browser_tasks")
    .select("id, status, run_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: run } = await admin
    .from("listing_agent_runs")
    .select("user_id")
    .eq("id", task.run_id)
    .single();
  if (!run || run.user_id !== user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (task.status !== "pending") {
    // Tâche expirée entre-temps (timeout serveur) : réponse ignorée, l'extension
    // reprendra à la prochaine tâche.
    return NextResponse.json({ stale: true });
  }

  // Plafonds : un snapshot ne doit pas pouvoir gonfler la base.
  const snapshot = body.snapshot
    ? {
        url: String(body.snapshot.url ?? "").slice(0, 2000),
        title: String(body.snapshot.title ?? "").slice(0, 300),
        text: String(body.snapshot.text ?? "").slice(0, 12_000),
        elements: Array.isArray(body.snapshot.elements) ? body.snapshot.elements.slice(0, 100) : [],
        scroll:
          body.snapshot.scroll && typeof body.snapshot.scroll.y === "number"
            ? { y: Math.round(body.snapshot.scroll.y), max: Math.round(Number(body.snapshot.scroll.max) || 0) }
            : undefined,
      }
    : undefined;

  await admin
    .from("agent_browser_tasks")
    .update({
      status: body.ok || body.declined ? "done" : "failed",
      response: {
        ok: body.ok,
        declined: body.declined === true,
        error: typeof body.error === "string" ? body.error.slice(0, 500) : undefined,
        snapshot,
      } as Json,
      responded_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("status", "pending");

  return NextResponse.json({ ok: true });
}
