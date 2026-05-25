/**
 * app/api/agents/sandbox/route.ts
 * ────────────────────────────────────────────────────────────
 * Gestion du mode sandbox depuis l'admin.
 *
 *  action = "set_mode"  → bascule sandbox ↔ live
 *  action = "purge"     → efface toutes les données sandbox
 *  action = "toggle_pause" → active/désactive le coupe-circuit
 *
 * Réservé aux admins.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await getAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  }

  const { action, mode } = await req.json().catch(() => ({}));
  const sb = createAdminClient();

  // ── Basculer sandbox / live ──
  if (action === "set_mode") {
    if (!["sandbox", "live"].includes(mode)) {
      return NextResponse.json({ error: "Mode invalide" }, { status: 400 });
    }
    await sb.from("agent_budget").update({ mode }).eq("id", 1);
    return NextResponse.json({ ok: true, mode });
  }

  // ── Vider la sandbox ──
  if (action === "purge") {
    const { error } = await sb.rpc("purge_sandbox");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, message: "Données sandbox effacées." });
  }

  // ── Coupe-circuit global ──
  if (action === "toggle_pause") {
    const { data } = await sb.from("agent_budget").select("is_paused").eq("id", 1).single();
    const next = !data?.is_paused;
    await sb.from("agent_budget").update({ is_paused: next }).eq("id", 1);
    return NextResponse.json({ ok: true, is_paused: next });
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
