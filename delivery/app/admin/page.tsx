/**
 * app/admin/page.tsx
 * ────────────────────────────────────────────────────────────
 * Tableau de bord KPI. Lit la vue admin_kpis (calculée à la volée)
 * + l'état du budget des agents.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
    <div className="rounded-xl border border-[#E4E1D8] bg-white p-5">
      <div className="text-xs font-medium text-[#9E9B90]">{label}</div>
      <div
        className="mt-1.5 text-3xl font-bold leading-none"
        style={{ color: accent ?? "#1B1B18" }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[#9E9B90]">{sub}</div>}
    </div>
  );
}

export default async function AdminKpiPage() {
  const sb = createAdminClient();

  const { data: kpi } = await sb.from("admin_kpis").select("*").single();
  const { data: budget } = await sb.from("agent_budget").select("*").eq("id", 1).single();

  // Activité agents récente
  const { data: runs } = await sb
    .from("agent_runs")
    .select("agent_slug, status, items_produced, cost_usd, started_at")
    .order("started_at", { ascending: false })
    .limit(8);

  const k = kpi ?? {};
  const dailyPct = budget
    ? Math.round((Number(budget.daily_spent_usd) / Number(budget.daily_cap_usd)) * 100)
    : 0;
  const monthlyPct = budget
    ? Math.round((Number(budget.monthly_spent_usd) / Number(budget.monthly_cap_usd)) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-[#1B1B18]">Vue d&apos;ensemble</h1>
        <p className="text-sm text-[#9E9B90]">Indicateurs clés de Prompta en temps réel.</p>
      </div>

      {/* KPIs business */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Utilisateurs" value={k.total_users ?? 0} sub={`+${k.new_users_7d ?? 0} cette semaine`} />
        <KpiCard label="Prompts publiés" value={k.published_listings ?? 0} sub={`${k.total_listings ?? 0} au total`} accent="#0A66C2" />
        <KpiCard label="Ventes" value={k.total_purchases ?? 0} sub="achats complétés" />
        <KpiCard label="Revenus 30j" value={eur(k.revenue_30d_cents ?? 0)} sub={`${eur(k.gross_revenue_cents ?? 0)} cumulé`} accent="#16A34A" />
        <KpiCard label="Commission plateforme" value={eur(k.platform_revenue_cents ?? 0)} sub="ta part cumulée" accent="#16A34A" />
        <KpiCard label="Téléchargements" value={k.total_downloads ?? 0} />
        <KpiCard label="Note moyenne" value={`${k.avg_rating ?? 0} ★`} />
        <KpiCard
          label="À valider"
          value={k.outputs_awaiting_review ?? 0}
          sub="outputs d'agents"
          accent={(k.outputs_awaiting_review ?? 0) > 0 ? "#D97706" : "#1B1B18"}
        />
      </div>

      {/* Budget agents — la sécurité financière */}
      <div className="rounded-xl border border-[#E4E1D8] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#1B1B18]">Budget des agents</h2>
          {budget?.is_paused && (
            <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-semibold text-[#DC2626]">
              ⏸ Coupe-circuit actif
            </span>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-[#5C5A52]">Aujourd&apos;hui</span>
              <span className="font-semibold">
                ${Number(budget?.daily_spent_usd ?? 0).toFixed(2)} / ${Number(budget?.daily_cap_usd ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#F4F2EE]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, dailyPct)}%`,
                  background: dailyPct > 80 ? "#DC2626" : dailyPct > 50 ? "#D97706" : "#16A34A",
                }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-[#5C5A52]">Ce mois-ci</span>
              <span className="font-semibold">
                ${Number(budget?.monthly_spent_usd ?? 0).toFixed(2)} / ${Number(budget?.monthly_cap_usd ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#F4F2EE]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, monthlyPct)}%`,
                  background: monthlyPct > 80 ? "#DC2626" : monthlyPct > 50 ? "#D97706" : "#16A34A",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dernières exécutions */}
      <div className="rounded-xl border border-[#E4E1D8] bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-[#1B1B18]">Dernières exécutions d&apos;agents</h2>
        {(!runs || runs.length === 0) && (
          <p className="text-sm text-[#9E9B90]">Aucune exécution pour le moment.</p>
        )}
        <div className="divide-y divide-[#E4E1D8]">
          {(runs ?? []).map((r, i) => (
            <div key={i} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium text-[#1B1B18]">{r.agent_slug}</span>
              <div className="flex items-center gap-3 text-xs text-[#9E9B90]">
                <span>{r.items_produced} item(s)</span>
                <span>${Number(r.cost_usd).toFixed(3)}</span>
                <span
                  className="rounded-full px-2 py-0.5 font-semibold"
                  style={{
                    background:
                      r.status === "done" ? "#DCFCE7" : r.status === "blocked" ? "#FEF3C7" : "#FEE2E2",
                    color:
                      r.status === "done" ? "#16A34A" : r.status === "blocked" ? "#D97706" : "#DC2626",
                  }}
                >
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
