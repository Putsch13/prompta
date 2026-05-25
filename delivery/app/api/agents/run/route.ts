/**
 * app/api/agents/run/route.ts
 * ────────────────────────────────────────────────────────────
 * Déclenchement MANUEL d'un agent depuis l'admin (bouton "Lancer").
 *
 * Sécurité : réservé aux admins (getAdminOrNull).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/admin/guard";
import { startAgentRun } from "@/lib/agents/runner";
import type { AgentSlug } from "@/lib/agents/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VALID_SLUGS: AgentSlug[] = [
  "prompt_factory",
  "linkedin_publisher",
  "seo_content",
  "moderation",
  "email_crm",
  "analytics_pricing",
  "affiliate",
];

export async function POST(req: NextRequest) {
  // ── Sécurité : admin uniquement ──
  const admin = await getAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const slug = body.slug as AgentSlug;

  if (!slug || !VALID_SLUGS.includes(slug)) {
    return NextResponse.json({ error: "Agent invalide" }, { status: 400 });
  }

  const result = await startAgentRun(slug, "manual");

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    runId: result.runId,
    summary: result.result.summary,
    itemsProduced: result.result.itemsProduced,
  });
}
