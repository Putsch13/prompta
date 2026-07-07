/**
 * Planification & déclencheurs d'un agent (propriétaire uniquement).
 *
 * GET    → planning actuel + URL webhook (créée à la volée avec secret HMAC)
 * POST   → { kind: "daily"|"weekly", day?, time } — crée/remplace le planning
 * DELETE → désactive le planning
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseScheduleToken,
  formatScheduleToken,
  describeSchedule,
  nextOccurrence,
  type SchedulePreset,
} from "@/lib/agent/schedule-token";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://prompta-sjtf.onrender.com";

async function ownedListing(listingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: listing } = await admin
    .from("listings")
    .select("id, creator_id, status")
    .eq("id", listingId)
    .single();
  if (!listing || listing.creator_id !== user.id) {
    return { error: NextResponse.json({ error: "Non autorisé" }, { status: 403 }) };
  }
  return { user, listing, admin };
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await ownedListing(id);
  if ("error" in ctx) return ctx.error;
  const { user, admin } = ctx;

  const { data: sched } = await admin
    .from("scheduled_runs")
    .select("cron_expression, active, next_run_at, last_run_at")
    .eq("listing_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Webhook : un trigger par agent, créé à la première demande.
  let { data: trigger } = await admin
    .from("agent_triggers")
    .select("id, webhook_secret, enabled")
    .eq("listing_id", id)
    .eq("owner_id", user.id)
    .eq("type", "webhook")
    .maybeSingle();
  if (!trigger) {
    const { data: created } = await admin
      .from("agent_triggers")
      .insert({
        listing_id: id,
        owner_id: user.id,
        type: "webhook",
        enabled: true,
        webhook_secret: crypto.randomBytes(24).toString("hex"),
        config: {},
      })
      .select("id, webhook_secret, enabled")
      .single();
    trigger = created;
  }

  const preset = sched?.active ? parseScheduleToken(sched.cron_expression) : null;
  return NextResponse.json({
    schedule: preset
      ? { ...preset, label: describeSchedule(preset), nextRunAt: sched?.next_run_at ?? null, lastRunAt: sched?.last_run_at ?? null }
      : null,
    webhook: trigger
      ? {
          url: `${APP_URL}/api/webhooks/agent/${trigger.id}`,
          secret: trigger.webhook_secret,
          signatureHeader: "x-webhook-signature",
          enabled: trigger.enabled,
        }
      : null,
  });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await ownedListing(id);
  if ("error" in ctx) return ctx.error;
  const { user, listing, admin } = ctx;

  if (!["published", "under_review"].includes(listing.status ?? "")) {
    return NextResponse.json(
      { error: "Mets d'abord l'agent en production pour le planifier." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Partial<SchedulePreset>;
  if (body.kind !== "daily" && body.kind !== "weekly") {
    return NextResponse.json({ error: "kind: daily | weekly requis" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(body.time ?? "")) {
    return NextResponse.json({ error: "time: HH:MM requis" }, { status: 400 });
  }
  const preset: SchedulePreset = {
    kind: body.kind,
    time: body.time!,
    ...(body.kind === "weekly" ? { day: Math.min(6, Math.max(0, Number(body.day ?? 1))) } : {}),
  };

  const next = nextOccurrence(preset);
  const { data: existing } = await admin
    .from("scheduled_runs")
    .select("id")
    .eq("listing_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const row = {
    user_id: user.id,
    listing_id: id,
    cron_expression: formatScheduleToken(preset),
    active: true,
    next_run_at: next.toISOString(),
  };
  if (existing) {
    await (admin.from("scheduled_runs") as any).update(row).eq("id", existing.id);
  } else {
    await (admin.from("scheduled_runs") as any).insert(row);
  }

  return NextResponse.json({
    schedule: { ...preset, label: describeSchedule(preset), nextRunAt: next.toISOString() },
  });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ctx = await ownedListing(id);
  if ("error" in ctx) return ctx.error;
  const { user, admin } = ctx;

  await admin
    .from("scheduled_runs")
    .update({ active: false })
    .eq("listing_id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
