/**
 * app/admin/page.tsx — Cockpit opérateur Prompta.
 *
 * Prompta n'est plus une marketplace : ce tableau pilote la PLATEFORME —
 * croissance (utilisateurs, agents en production), usage (runs, taux de
 * succès), monétisation (abonnements par plan, MRR, crédits consommés),
 * et santé runtime (file worker, échecs récents, budget IA).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

function eur(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <div className="text-xs font-medium text-ink-faint">{label}</div>
      <div className="mt-1.5 text-3xl font-bold leading-none" style={{ color: accent ?? "var(--ink, #1B1B18)" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
    </div>
  );
}

export default async function AdminKpiPage() {
  const sb = createAdminClient();

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600e3).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600e3).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600e3).toISOString();

  const [
    { count: totalUsers },
    { count: newUsers7d },
    { count: totalAgents },
    { count: publishedAgents },
    { count: newAgents7d },
    { data: runs7d },
    { count: pendingRuns },
    { data: oldestPending },
    { count: pendingApprovals },
    { data: subs },
    { data: credits30d },
    { data: connections },
    { data: budget },
    { data: recentFails },
  ] = await Promise.all([
    sb.from("profiles").select("*", { count: "exact", head: true }),
    sb.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    sb.from("listings").select("*", { count: "exact", head: true }).neq("type", "prompt").neq("status", "deleted"),
    sb.from("listings").select("*", { count: "exact", head: true }).neq("type", "prompt").in("status", ["published", "under_review"]),
    sb.from("listings").select("*", { count: "exact", head: true }).neq("type", "prompt").neq("status", "deleted").gte("created_at", weekAgo),
    sb.from("listing_agent_runs").select("status, listing_id, created_at, listing:listings(title)").gte("created_at", weekAgo),
    sb.from("listing_agent_runs").select("*", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("listing_agent_runs").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    sb.from("agent_approvals").select("*", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("platform_subscriptions").select("plan").eq("status", "active"),
    sb.from("credit_transactions").select("amount_cents").lt("amount_cents", 0).gte("created_at", monthAgo),
    sb.from("user_connections").select("connector_id").limit(5000),
    sb.from("agent_budget").select("*").eq("id", 1).maybeSingle(),
    sb
      .from("listing_agent_runs")
      .select("id, error_message, created_at, listing:listings(title)")
      .eq("status", "failed")
      .gte("created_at", dayAgo)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  // ── Usage runs 7j ──
  const runsList = (runs7d ?? []) as Array<{ status: string; listing_id: string | null; created_at: string; listing: { title?: string } | null }>;
  const runsTotal = runsList.length;
  const runsCompleted = runsList.filter((r) => r.status === "completed").length;
  const runsFailed = runsList.filter((r) => r.status === "failed").length;
  const successRate = runsTotal > 0 ? Math.round((runsCompleted / runsTotal) * 100) : 100;
  const runs24h = runsList.filter((r) => r.created_at >= dayAgo).length;

  const byAgent = new Map<string, { title: string; count: number }>();
  for (const r of runsList) {
    if (!r.listing_id) continue;
    const cur = byAgent.get(r.listing_id) ?? { title: r.listing?.title ?? r.listing_id.slice(0, 8), count: 0 };
    byAgent.set(r.listing_id, { ...cur, count: cur.count + 1 });
  }
  const topAgents = [...byAgent.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  // ── Monétisation ──
  const subsByPlan = new Map<PlanId, number>();
  for (const s of (subs ?? []) as Array<{ plan: string }>) {
    const id = (PLAN_ORDER.includes(s.plan as PlanId) ? s.plan : "starter") as PlanId;
    subsByPlan.set(id, (subsByPlan.get(id) ?? 0) + 1);
  }
  const mrrCents = PLAN_ORDER.reduce(
    (sum, id) => sum + (subsByPlan.get(id) ?? 0) * PLANS[id].priceCents,
    0,
  );
  const creditsConsumed30d = (credits30d ?? []).reduce(
    (sum, t) => sum + Math.abs(Number((t as any).amount_cents ?? 0)),
    0,
  );

  // ── Connexions apps ──
  const connList = (connections ?? []) as Array<{ connector_id: string }>;
  const byApp = new Map<string, number>();
  for (const c of connList) byApp.set(c.connector_id, (byApp.get(c.connector_id) ?? 0) + 1);
  const topApps = [...byApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const pendingAgeMin = oldestPending?.created_at
    ? Math.round((now.getTime() - new Date(oldestPending.created_at).getTime()) / 60000)
    : 0;

  const dailyPct = budget ? Math.round((Number(budget.daily_spent_usd) / Number(budget.daily_cap_usd)) * 100) : 0;
  const monthlyPct = budget ? Math.round((Number(budget.monthly_spent_usd) / Number(budget.monthly_cap_usd)) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink">Cockpit Prompta</h1>
        <p className="text-sm text-ink-faint">
          Croissance, usage, monétisation, santé — en temps réel.
        </p>
      </div>

      {/* ── Croissance ── */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Croissance</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Utilisateurs" value={totalUsers ?? 0} sub={`+${newUsers7d ?? 0} sur 7 jours`} />
          <KpiCard label="Agents créés" value={totalAgents ?? 0} sub={`+${newAgents7d ?? 0} sur 7 jours`} />
          <KpiCard label="Agents en production" value={publishedAgents ?? 0} accent="#4F46E5" />
          <KpiCard
            label="Validations en attente"
            value={pendingApprovals ?? 0}
            sub="approbations humaines"
            accent={(pendingApprovals ?? 0) > 0 ? "#D97706" : undefined}
          />
        </div>
      </section>

      {/* ── Usage ── */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Usage — 7 jours</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Runs" value={runsTotal} sub={`${runs24h} sur 24 h`} />
          <KpiCard
            label="Taux de succès"
            value={`${successRate} %`}
            sub={`${runsCompleted} ok · ${runsFailed} échecs`}
            accent={successRate >= 85 ? "#16A34A" : successRate >= 60 ? "#D97706" : "#DC2626"}
          />
          <KpiCard
            label="File worker"
            value={pendingRuns ?? 0}
            sub={pendingAgeMin > 0 ? `plus ancien : ${pendingAgeMin} min` : "à jour"}
            accent={(pendingRuns ?? 0) > 3 ? "#D97706" : undefined}
          />
          <KpiCard label="Apps connectées" value={byApp.size} sub={`${connList.length} connexions`} />
        </div>
        {topAgents.length > 0 && (
          <div className="mt-3 rounded-xl border border-line bg-card p-5">
            <p className="mb-2 text-xs font-semibold text-ink-soft">Agents les plus actifs (7 j)</p>
            {topAgents.map((a, i) => (
              <div key={i} className="flex justify-between py-1 text-sm">
                <span className="text-ink">{a.title}</span>
                <span className="text-ink-faint">{a.count} runs</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Monétisation ── */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Monétisation</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="MRR" value={eur(mrrCents)} sub="abonnements actifs" accent="#16A34A" />
          <KpiCard label="Abonnés payants" value={(subs ?? []).length} sub="plans starter/pro/scale" />
          <KpiCard label="Crédits consommés 30 j" value={eur(creditsConsumed30d)} sub="coût IA refacturé" />
          <KpiCard
            label="Répartition plans"
            value={PLAN_ORDER.filter((p) => p !== "free")
              .map((p) => `${subsByPlan.get(p) ?? 0}`)
              .join(" / ")}
            sub="starter / pro / scale"
          />
        </div>
      </section>

      {/* ── Santé ── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">Budget IA plateforme</h2>
            {budget?.is_paused && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                ⏸ Coupe-circuit actif
              </span>
            )}
          </div>
          {[
            { label: "Aujourd'hui", spent: Number(budget?.daily_spent_usd ?? 0), cap: Number(budget?.daily_cap_usd ?? 0), pct: dailyPct },
            { label: "Ce mois-ci", spent: Number(budget?.monthly_spent_usd ?? 0), cap: Number(budget?.monthly_cap_usd ?? 0), pct: monthlyPct },
          ].map((b) => (
            <div key={b.label} className="mb-3">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-soft">{b.label}</span>
                <span className="font-semibold text-ink">
                  ${b.spent.toFixed(2)} / ${b.cap.toFixed(2)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-card2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, b.pct)}%`,
                    background: b.pct > 80 ? "#DC2626" : b.pct > 50 ? "#D97706" : "#16A34A",
                  }}
                />
              </div>
            </div>
          ))}
          {topApps.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-ink-soft">Apps les plus connectées</p>
              <div className="flex flex-wrap gap-2">
                {topApps.map(([app, n]) => (
                  <span key={app} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-soft">
                    {app} · {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-line bg-card p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">Échecs récents (24 h)</h2>
          {(!recentFails || recentFails.length === 0) && (
            <p className="text-sm text-ink-faint">Aucun échec sur les dernières 24 h. 🎉</p>
          )}
          <div className="divide-y divide-line">
            {((recentFails ?? []) as Array<{ id: string; error_message: string | null; listing: { title?: string } | null }>).map((r) => (
              <div key={r.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-ink">{r.listing?.title ?? "Run de test"}</span>
                  <a href={`/dashboard/runs/${r.id}`} className="shrink-0 text-xs text-accent hover:underline">
                    Ouvrir →
                  </a>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-red-700">{r.error_message ?? "—"}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
