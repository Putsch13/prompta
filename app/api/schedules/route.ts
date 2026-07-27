import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseScheduleToken,
  formatScheduleToken,
  describeSchedule,
  nextOccurrence,
} from "@/lib/agent/schedule-token";

export const dynamic = "force-dynamic";

/**
 * Plannings d'agents gardés (table `scheduled_runs`).
 *
 * La table, ses presets et son consommateur (/api/cron/tick) existaient déjà,
 * mais AUCUN chemin du produit n'y écrivait : « chaque lundi, … » partait en
 * mission one-shot et l'utilisateur croyait son automatisation en place. Cette
 * route est le maillon manquant.
 *
 * GET  → plannings de l'utilisateur (avec le titre de l'agent).
 * POST → crée/remplace le planning d'un agent gardé.
 */

const MAX_SCHEDULES_PER_USER = 20;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("scheduled_runs")
    .select("id, listing_id, cron_expression, active, last_run_at, next_run_at")
    .eq("user_id", user.id)
    .order("next_run_at", { ascending: true });

  const listingIds = [...new Set((data ?? []).map((s) => s.listing_id))];
  const titles = new Map<string, string>();
  if (listingIds.length > 0) {
    const { data: listings } = await admin
      .from("listings")
      .select("id, title")
      .in("id", listingIds);
    for (const l of listings ?? []) titles.set(l.id, l.title ?? "Agent");
  }

  return NextResponse.json({
    schedules: (data ?? []).map((s) => {
      const preset = parseScheduleToken(s.cron_expression);
      return {
        id: s.id,
        listingId: s.listing_id,
        title: titles.get(s.listing_id) ?? "Agent",
        token: s.cron_expression,
        label: preset ? describeSchedule(preset) : s.cron_expression,
        active: s.active,
        lastRunAt: s.last_run_at,
        nextRunAt: s.next_run_at,
      };
    }),
  });
}

interface CreateBody {
  listingId?: string;
  /** Preset `daily@HH:MM` ou `weekly:D@HH:MM`. */
  token?: string;
  /** Entrées figées du planning (contexte de page exclu, voir plus bas). */
  inputs?: Record<string, string>;
  notifyEmail?: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const listingId = body?.listingId?.trim();
  const preset = parseScheduleToken(body?.token);
  if (!listingId || !preset) {
    return NextResponse.json(
      {
        error: "invalid_schedule",
        message: "Agent et fréquence requis (ex. « daily@09:00 » ou « weekly:1@09:00 »).",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: listing } = await admin
    .from("listings")
    .select("id, creator_id, current_version_id")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing || listing.creator_id !== user.id) {
    return NextResponse.json({ error: "not_found", message: "Agent introuvable." }, { status: 404 });
  }
  if (!listing.current_version_id) {
    return NextResponse.json(
      { error: "no_version", message: "Cet agent n'a pas de version exécutable." },
      { status: 422 },
    );
  }

  // Un planning rejoue des ENTRÉES FIGÉES. Le contexte de page capturé au
  // moment de la mission d'origine ({{page_active}}, {{tab_N}}) n'a plus aucun
  // sens des semaines plus tard : le rejouer produirait une réponse plausible
  // sur des données périmées. On le retire, et on refuse le planning si
  // l'agent en dépend — mieux vaut le dire que livrer du faux.
  const rawInputs = body?.inputs ?? {};
  const inputs: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawInputs)) {
    if (k === "page_active" || /^tab_\d+$/.test(k) || k.startsWith("__")) continue;
    if (typeof v === "string") inputs[k] = v;
  }

  const { data: version } = await admin
    .from("listing_versions")
    .select("env")
    .eq("id", listing.current_version_id)
    .maybeSingle();
  const manifestText = JSON.stringify(version?.env ?? {});
  if (/\{\{(page_active|tab_\d+)\}\}/.test(manifestText)) {
    return NextResponse.json(
      {
        error: "context_dependent",
        message:
          "Cet agent lit la page que tu avais sous les yeux : il ne peut pas être planifié tel quel. Relance-le depuis l'extension, ou reformule la mission pour qu'elle aille chercher ses données dans tes apps connectées.",
      },
      { status: 422 },
    );
  }

  const { count } = await admin
    .from("scheduled_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("active", true);
  if ((count ?? 0) >= MAX_SCHEDULES_PER_USER) {
    return NextResponse.json(
      {
        error: "too_many_schedules",
        message: `Maximum ${MAX_SCHEDULES_PER_USER} plannings actifs. Désactive-en un pour en créer un autre.`,
      },
      { status: 422 },
    );
  }

  const token = formatScheduleToken(preset);
  const next = nextOccurrence(preset);

  // Un seul planning par agent : re-planifier remplace, ça évite les doublons
  // silencieux quand l'utilisateur reclique.
  await admin.from("scheduled_runs").delete().eq("user_id", user.id).eq("listing_id", listingId);

  const { data: created, error } = await admin
    .from("scheduled_runs")
    .insert({
      user_id: user.id,
      listing_id: listingId,
      cron_expression: token,
      inputs,
      notify_email: body?.notifyEmail !== false,
      active: true,
      next_run_at: next.toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[schedules] insert failed", error);
    return NextResponse.json(
      { error: "insert_failed", message: "Planning impossible à enregistrer." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: created.id,
    token,
    label: describeSchedule(preset),
    nextRunAt: next.toISOString(),
  });
}
