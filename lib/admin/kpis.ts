/**
 * lib/admin/kpis.ts — Agrégations du cockpit rentabilité admin.
 *
 * Toutes les requêtes sont bornées (volumes < 10k lignes) ; les agrégations
 * fines (fenêtres 7/30 j, top utilisateurs, séries jour par jour) sont faites
 * en JS. Aucune écriture : la page admin doit rester read-only.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, PLAN_ORDER, normalizePlanId, type PlanId } from "@/lib/billing/plans";
import { PLATFORM_DAILY_COST_CAP_CENTS } from "@/lib/billing/circuit-breaker";
import { CREDIT_PACKS } from "@/lib/credit-packs";

const FETCH_CAP = 10_000;

/* ── Types de sortie ─────────────────────────────────────────────────── */

export interface DayPoint {
  /** Date ISO (YYYY-MM-DD, UTC). */
  day: string;
  count: number;
}

export interface TopCostUser {
  userId: string;
  displayName: string;
  plan: PlanId;
  costCents: number;
  billedCents: number;
  marginCents: number;
  runCount: number;
}

export interface EconWindow {
  costCents: number;
  billedCents: number;
  marginCents: number;
  runCount: number;
}

export interface AdminAlert {
  severity: "destructive" | "warning";
  title: string;
  detail: string;
}

export interface AdminKpis {
  /* Header burn / santé */
  guard: {
    isPaused: boolean;
    /** Coût API du jour (0 si le compteur date d'un autre jour). */
    dailyCostCents: number;
    dailyMarginCents: number;
    capCents: number;
    /** true si la ligne guard n'a jamais été créée (aucun run crédits). */
    missing: boolean;
  };

  /* Revenus */
  mrrCents: number;
  subsByPlan: Record<PlanId, number>;
  payingSubs: number;
  packs30d: { cashCents: number; creditsCents: number; count: number; unknownCount: number };
  welcome: { totalCents: number; totalCount: number; cents30d: number; count30d: number };

  /* Rentabilité runs */
  econ7d: EconWindow;
  econ30d: EconWindow;
  topCostUsers30d: TopCostUser[];

  /* Passif crédits */
  liability: {
    balanceCents: number;
    heldCents: number;
    holders: number;
    anomalies: number;
  };

  /* Usage produit */
  runsPerDay14d: DayPoint[];
  signupsPerDay14d: DayPoint[];
  runs7d: { total: number; instant: number; missions: number; failed: number; completed: number };
  runs24h: { total: number; failed: number; failRatePct: number };
  activeUsers7d: number;

  /* Alertes */
  alerts: AdminAlert[];
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Série continue des `days` derniers jours (UTC), remplie à 0. */
function daySeries(days: number, now: Date): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    map.set(isoDay(new Date(now.getTime() - i * 86_400_000)), 0);
  }
  return map;
}

function bump(map: Map<string, number>, createdAt: string | null) {
  if (!createdAt) return;
  const day = createdAt.slice(0, 10);
  if (map.has(day)) map.set(day, (map.get(day) ?? 0) + 1);
}

function toPoints(map: Map<string, number>): DayPoint[] {
  return [...map.entries()].map(([day, count]) => ({ day, count }));
}

/** Prix cash d'un pack déduit des crédits octroyés (les packs bonusés créditent plus que le prix payé). */
const PACK_CASH_BY_CREDITS = new Map<number, number>(
  CREDIT_PACKS.map((p) => [p.creditsCents, p.amountCents]),
);

/* ── Fetch + agrégation ──────────────────────────────────────────────── */

export async function getAdminKpis(): Promise<AdminKpis> {
  const sb = createAdminClient();

  const now = new Date();
  const iso = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const d1 = iso(1);
  const d7 = iso(7);
  const d14 = iso(14);
  const d30 = iso(30);
  const today = isoDay(now);

  const [
    { data: guardRow },
    { data: subs },
    { data: packTx },
    { data: welcomeTx },
    { data: econRows },
    { data: creditRows },
    { data: runRows },
    { data: signupRows },
  ] = await Promise.all([
    sb.from("platform_credit_guard").select("*").eq("id", 1).maybeSingle(),
    sb.from("platform_subscriptions").select("user_id, plan").eq("status", "active").limit(FETCH_CAP),
    sb
      .from("credit_transactions")
      .select("amount_cents, created_at")
      .eq("kind", "purchase")
      .gt("amount_cents", 0)
      .gte("created_at", d30)
      .limit(FETCH_CAP),
    // Crédits de bienvenue : kind=bonus + clé idempotente `welcome_<userId>`.
    sb
      .from("credit_transactions")
      .select("amount_cents, created_at")
      .eq("kind", "bonus")
      .like("stripe_session_id", "welcome_%")
      .limit(FETCH_CAP),
    sb
      .from("platform_run_economics")
      .select("user_id, run_type, actual_cost_cents, billed_cents, margin_cents, created_at")
      .gte("created_at", d30)
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP),
    sb.from("user_credits").select("user_id, balance_cents, held_cents").limit(FETCH_CAP),
    sb
      .from("listing_agent_runs")
      .select("status, created_at, user_id, dry_run, instant:inputs->>__instant")
      .gte("created_at", d14)
      .limit(FETCH_CAP),
    sb.from("profiles").select("created_at").gte("created_at", d14).limit(FETCH_CAP),
  ]);

  /* ── Circuit breaker ── */
  // Le compteur journalier n'est remis à zéro qu'au premier run du jour :
  // si guard_day ≠ aujourd'hui, les compteurs affichés valent 0.
  const guardFresh = guardRow?.guard_day === today;
  const guard = {
    isPaused: Boolean(guardRow?.is_paused) && guardFresh,
    dailyCostCents: guardFresh ? Number(guardRow?.daily_cost_cents ?? 0) : 0,
    dailyMarginCents: guardFresh ? Number(guardRow?.daily_margin_cents ?? 0) : 0,
    capCents: PLATFORM_DAILY_COST_CAP_CENTS,
    missing: !guardRow,
  };

  /* ── Revenus : MRR + plans ── */
  const subsByPlan = { free: 0, starter: 0, pro: 0, scale: 0 } as Record<PlanId, number>;
  const planByUser = new Map<string, PlanId>();
  for (const s of subs ?? []) {
    const plan = normalizePlanId(s.plan);
    subsByPlan[plan] += 1;
    planByUser.set(s.user_id, plan);
  }
  const mrrCents = PLAN_ORDER.reduce((sum, id) => sum + subsByPlan[id] * PLANS[id].priceCents, 0);
  const payingSubs = PLAN_ORDER.filter((p) => p !== "free").reduce((n, p) => n + subsByPlan[p], 0);

  /* ── Revenus : packs crédits 30 j ── */
  const packs30d = { cashCents: 0, creditsCents: 0, count: 0, unknownCount: 0 };
  for (const t of packTx ?? []) {
    const credits = Number(t.amount_cents ?? 0);
    packs30d.creditsCents += credits;
    packs30d.count += 1;
    const cash = PACK_CASH_BY_CREDITS.get(credits);
    if (cash != null) {
      packs30d.cashCents += cash;
    } else {
      // Pack inconnu (ancien tarif ?) : on retient les crédits comme proxy du cash.
      packs30d.cashCents += credits;
      packs30d.unknownCount += 1;
    }
  }

  /* ── Coût d'acquisition : welcome credits ── */
  const welcome = { totalCents: 0, totalCount: 0, cents30d: 0, count30d: 0 };
  for (const t of welcomeTx ?? []) {
    const cents = Number(t.amount_cents ?? 0);
    welcome.totalCents += cents;
    welcome.totalCount += 1;
    if ((t.created_at ?? "") >= d30) {
      welcome.cents30d += cents;
      welcome.count30d += 1;
    }
  }

  /* ── Rentabilité runs (platform_run_economics) ── */
  const econ7d: EconWindow = { costCents: 0, billedCents: 0, marginCents: 0, runCount: 0 };
  const econ30d: EconWindow = { costCents: 0, billedCents: 0, marginCents: 0, runCount: 0 };
  const perUser = new Map<string, { costCents: number; billedCents: number; marginCents: number; runCount: number }>();

  for (const r of econRows ?? []) {
    const cost = Number(r.actual_cost_cents ?? 0);
    const billed = Number(r.billed_cents ?? 0);
    const margin = Number(r.margin_cents ?? 0);

    econ30d.costCents += cost;
    econ30d.billedCents += billed;
    econ30d.marginCents += margin;
    econ30d.runCount += 1;
    if ((r.created_at ?? "") >= d7) {
      econ7d.costCents += cost;
      econ7d.billedCents += billed;
      econ7d.marginCents += margin;
      econ7d.runCount += 1;
    }

    if (r.user_id) {
      const cur = perUser.get(r.user_id) ?? { costCents: 0, billedCents: 0, marginCents: 0, runCount: 0 };
      cur.costCents += cost;
      cur.billedCents += billed;
      cur.marginCents += margin;
      cur.runCount += 1;
      perUser.set(r.user_id, cur);
    }
  }

  const topEntries = [...perUser.entries()]
    .sort((a, b) => b[1].costCents - a[1].costCents)
    .slice(0, 10);

  let namesById = new Map<string, string>();
  if (topEntries.length > 0) {
    const { data: topProfiles } = await sb
      .from("profiles")
      .select("id, display_name")
      .in("id", topEntries.map(([id]) => id));
    namesById = new Map((topProfiles ?? []).map((p) => [p.id, p.display_name]));
  }

  const topCostUsers30d: TopCostUser[] = topEntries.map(([userId, agg]) => ({
    userId,
    displayName: namesById.get(userId) ?? userId.slice(0, 8),
    plan: planByUser.get(userId) ?? "free",
    ...agg,
  }));

  /* ── Passif crédits ── */
  const liability = { balanceCents: 0, heldCents: 0, holders: 0, anomalies: 0 };
  for (const c of creditRows ?? []) {
    const balance = Number(c.balance_cents ?? 0);
    const held = Number(c.held_cents ?? 0);
    if (balance > 0) {
      liability.balanceCents += balance;
      liability.holders += 1;
    }
    liability.heldCents += Math.max(0, held);
    if (balance < 0 || held < 0 || held > Math.max(balance, 0)) liability.anomalies += 1;
  }

  /* ── Usage produit ── */
  const runsDayMap = daySeries(14, now);
  const runs7 = { total: 0, instant: 0, missions: 0, failed: 0, completed: 0 };
  const runs24 = { total: 0, failed: 0 };
  const activeUserIds = new Set<string>();

  for (const r of (runRows ?? []) as Array<{
    status: string;
    created_at: string | null;
    user_id: string;
    dry_run: boolean;
    instant: string | null;
  }>) {
    bump(runsDayMap, r.created_at);
    const at = r.created_at ?? "";
    if (at >= d7) {
      runs7.total += 1;
      if (r.instant === "1") runs7.instant += 1;
      else runs7.missions += 1;
      if (r.status === "failed") runs7.failed += 1;
      if (r.status === "completed") runs7.completed += 1;
      activeUserIds.add(r.user_id);
    }
    if (at >= d1) {
      runs24.total += 1;
      if (r.status === "failed") runs24.failed += 1;
    }
  }
  const failRate24hPct = runs24.total > 0 ? Math.round((runs24.failed / runs24.total) * 100) : 0;

  const signupsDayMap = daySeries(14, now);
  for (const p of signupRows ?? []) bump(signupsDayMap, p.created_at);

  /* ── Alertes automatiques ── */
  const alerts: AdminAlert[] = [];

  if (guard.isPaused) {
    alerts.push({
      severity: "destructive",
      title: "Coupe-circuit crédits déclenché",
      detail: `Runs sur crédits suspendus — coût du jour ${(guard.dailyCostCents / 100).toFixed(2)} € / cap ${(guard.capCents / 100).toFixed(2)} €.`,
    });
  } else if (guard.capCents > 0 && guard.dailyCostCents >= guard.capCents * 0.8) {
    alerts.push({
      severity: "warning",
      title: "Coût API du jour proche du cap",
      detail: `${Math.round((guard.dailyCostCents / guard.capCents) * 100)} % du plafond journalier consommé.`,
    });
  }

  if (runs24.total >= 5 && failRate24hPct > 20) {
    alerts.push({
      severity: "destructive",
      title: `Taux d'échec 24 h : ${failRate24hPct} %`,
      detail: `${runs24.failed} runs en échec sur ${runs24.total} — vérifier le worker et les derniers déploiements.`,
    });
  }

  const losers = topCostUsers30d.filter((u) => u.marginCents < 0);
  if (losers.length > 0) {
    alerts.push({
      severity: "warning",
      title: `${losers.length} compte${losers.length > 1 ? "s" : ""} à marge négative (30 j)`,
      detail: losers
        .slice(0, 3)
        .map((u) => `${u.displayName} (${(u.marginCents / 100).toFixed(2)} €)`)
        .join(" · "),
    });
  }

  if (liability.anomalies > 0) {
    alerts.push({
      severity: "warning",
      title: `${liability.anomalies} solde${liability.anomalies > 1 ? "s" : ""} crédits anormal${liability.anomalies > 1 ? "aux" : ""}`,
      detail: "Balance négative ou hold supérieur au solde — inspecter user_credits / credit_transactions.",
    });
  }

  return {
    guard,
    mrrCents,
    subsByPlan,
    payingSubs,
    packs30d,
    welcome,
    econ7d,
    econ30d,
    topCostUsers30d,
    liability,
    runsPerDay14d: toPoints(runsDayMap),
    signupsPerDay14d: toPoints(signupsDayMap),
    runs7d: runs7,
    runs24h: { ...runs24, failRatePct: failRate24hPct },
    activeUsers7d: activeUserIds.size,
    alerts,
  };
}
