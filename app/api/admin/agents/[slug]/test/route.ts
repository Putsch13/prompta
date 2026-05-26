import { NextRequest, NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const admin = await getAdminOrNull();
  if (!admin) return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });

  const reasons: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) reasons.push("missing ANTHROPIC_API_KEY");
  if (!process.env.AGENT_MODEL && !process.env.ANTHROPIC_API_KEY) reasons.push("missing AGENT_MODEL");

  const sb = createAdminClient();
  const { data: def } = await sb.from("agent_definitions").select("*").eq("slug", params.slug).single();
  if (!def) return NextResponse.json({ ok: false, reason: "Agent inconnu" }, { status: 404 });
  if (!def.is_enabled) reasons.push("agent disabled");

  const { data: budget } = await sb.from("agent_budget").select("is_paused, mode").eq("id", 1).single();
  if (budget?.is_paused) reasons.push("daily limit reached / agents paused");
  if (budget?.mode === "sandbox") {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      reason: reasons.length ? reasons.join("; ") : "Dry-run sandbox OK",
      mode: "sandbox",
    });
  }

  if (reasons.length) {
    return NextResponse.json({ ok: false, reasons, dryRun: true });
  }

  return NextResponse.json({
    ok: true,
    dryRun: true,
    reason: "Configuration OK — prêt pour un run live",
    model: process.env.AGENT_MODEL || "claude-sonnet-4-6",
  });
}
