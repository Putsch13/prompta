/**
 * app/admin/page.tsx — Cockpit de pilotage RENTABILITÉ Prompta.
 *
 * Une seule question : est-ce que la plateforme gagne de l'argent ?
 *  1. Burn / santé — circuit breaker, coût API du jour vs cap, marge du jour.
 *  2. Revenus — MRR par plan, packs crédits, coût d'acquisition (welcome).
 *  3. Rentabilité runs — coût API réel vs facturé (platform_run_economics),
 *     top comptes par coût pour repérer ceux qui font perdre de l'argent.
 *  4. Passif crédits — la dette envers les utilisateurs.
 *  5. Usage produit — runs/jour, missions vs tac au tac, signups, actifs.
 *  6. Alertes automatiques.
 *
 * Données agrégées dans lib/admin/kpis.ts (read-only, requêtes bornées).
 */

import { getAdminKpis, type DayPoint, type EconWindow } from "@/lib/admin/kpis";
import { PLANS, PLAN_ORDER } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

/* ── Formatage ───────────────────────────────────────────────────────── */

function eur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)} %`;
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

/* ── Briques UI ──────────────────────────────────────────────────────── */

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
    <div className="hud-card p-5">
      <div className="text-xs font-medium text-ink-faint">{label}</div>
      <div className={`mt-1.5 font-mono text-2xl font-bold leading-none tracking-tight ${accent ?? "text-ink"}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-faint">{sub}</div>}
    </div>
  );
}

/** Mini bar chart CSS pur — 14 points, hauteur relative au max. */
function BarChart({ points, barClass }: { points: DayPoint[]; barClass: string }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex h-24 items-end gap-1" role="img" aria-label="Histogramme 14 jours">
      {points.map((p) => (
        <div key={p.day} className="group relative flex h-full flex-1 flex-col justify-end">
          <div
            className={`w-full rounded-sm ${p.count > 0 ? barClass : "bg-card2"}`}
            style={{ height: `${Math.max(p.count > 0 ? 6 : 3, (p.count / max) * 100)}%` }}
            title={`${dayLabel(p.day)} : ${p.count}`}
          />
        </div>
      ))}
    </div>
  );
}

function EconRow({ label, win }: { label: string; win: EconWindow }) {
  const marginPct = win.billedCents > 0 ? Math.round((win.marginCents / win.billedCents) * 100) : null;
  return (
    <tr className="border-t border-line">
      <td className="py-2.5 pr-3 text-xs font-medium text-ink-soft">{label}</td>
      <td className="py-2.5 pr-3 text-right font-mono text-sm text-ink">{eur(win.costCents)}</td>
      <td className="py-2.5 pr-3 text-right font-mono text-sm text-ink">{eur(win.billedCents)}</td>
      <td
        className={`py-2.5 pr-3 text-right font-mono text-sm font-semibold ${
          win.marginCents > 0 ? "text-success" : win.marginCents < 0 ? "text-destructive" : "text-ink"
        }`}
      >
        {eur(win.marginCents)}
      </td>
      <td className="py-2.5 pr-3 text-right font-mono text-sm text-ink-soft">
        {marginPct == null ? "—" : `${marginPct} %`}
      </td>
      <td className="py-2.5 text-right font-mono text-sm text-ink-faint">{win.runCount}</td>
    </tr>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default async function AdminKpiPage() {
  const k = await getAdminKpis();

  const capPct =
    k.guard.capCents > 0 ? Math.min(100, Math.round((k.guard.dailyCostCents / k.guard.capCents) * 100)) : 0;
  const runFailRate7d =
    k.runs7d.total > 0 ? Math.round((k.runs7d.failed / k.runs7d.total) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink">Pilotage rentabilité</h1>
        <p className="text-sm text-ink-faint">
          Coût API réel vs facturé, revenus, passif crédits et usage — en temps réel.
        </p>
      </div>

      {/* ── 1. Burn / santé du jour ── */}
      <section>
        <h2 className="hud-label mb-3">Burn du jour</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="hud-card p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-ink-faint">Circuit breaker</div>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  k.guard.isPaused
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-success/30 bg-success/10 text-success"
                }`}
              >
                {k.guard.isPaused ? "⏸ Déclenché" : "● Opérationnel"}
              </span>
            </div>
            <div className={`mt-2 font-mono text-2xl font-bold ${k.guard.isPaused ? "text-destructive" : "text-ink"}`}>
              {k.guard.isPaused ? "Runs crédits stoppés" : "Runs crédits ouverts"}
            </div>
            {k.guard.missing && (
              <div className="mt-1.5 text-xs text-ink-faint">Aucun run crédits enregistré à ce jour.</div>
            )}
          </div>

          <div className="hud-card p-5">
            <div className="text-xs font-medium text-ink-faint">Coût API aujourd&apos;hui vs cap</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-ink">
              {eur(k.guard.dailyCostCents)}
              <span className="text-sm font-medium text-ink-faint"> / {eur(k.guard.capCents)}</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-card2">
              <div
                className={`h-full rounded-full ${
                  capPct >= 80 ? "bg-destructive" : capPct >= 50 ? "bg-warning" : "bg-success"
                }`}
                style={{ width: `${capPct}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-ink-faint">{capPct} % du plafond journalier</div>
          </div>

          <KpiCard
            label="Marge du jour (runs crédits)"
            value={eur(k.guard.dailyMarginCents)}
            sub="facturé − coût API réel"
            accent={
              k.guard.dailyMarginCents > 0
                ? "text-success"
                : k.guard.dailyMarginCents < 0
                  ? "text-destructive"
                  : undefined
            }
          />
        </div>
      </section>

      {/* ── 6. Alertes (remontées en haut : c'est ce qu'on doit voir d'abord) ── */}
      {k.alerts.length > 0 && (
        <section>
          <h2 className="hud-label mb-3">Alertes</h2>
          <div className="space-y-2">
            {k.alerts.map((a, i) => (
              <div
                key={i}
                className={`hud-card flex items-start gap-3 border-l-2 p-4 ${
                  a.severity === "destructive" ? "border-l-destructive" : "border-l-warning"
                }`}
              >
                <span
                  className={`mt-0.5 text-xs font-bold ${
                    a.severity === "destructive" ? "text-destructive" : "text-warning"
                  }`}
                >
                  {a.severity === "destructive" ? "▲" : "●"}
                </span>
                <div>
                  <div className="text-sm font-semibold text-ink">{a.title}</div>
                  <div className="mt-0.5 text-xs text-ink-faint">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 2. Revenus ── */}
      <section>
        <h2 className="hud-label mb-3">Revenus</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="MRR"
            value={eur(k.mrrCents)}
            sub={`${k.payingSubs} abonné${k.payingSubs > 1 ? "s" : ""} payant${k.payingSubs > 1 ? "s" : ""}`}
            accent="text-success"
          />
          {PLAN_ORDER.filter((p) => p !== "free").map((p) => (
            <KpiCard
              key={p}
              label={`Plan ${PLANS[p].label}`}
              value={k.subsByPlan[p]}
              sub={`× ${eur(PLANS[p].priceCents)} = ${eur(k.subsByPlan[p] * PLANS[p].priceCents)}/mois`}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Packs crédits — 30 j"
            value={eur(k.packs30d.cashCents)}
            sub={
              k.packs30d.count > 0
                ? `${k.packs30d.count} achat${k.packs30d.count > 1 ? "s" : ""} · ${eur(k.packs30d.creditsCents)} crédités${
                    k.packs30d.unknownCount > 0 ? ` · ${k.packs30d.unknownCount} pack(s) hors tarif actuel` : ""
                  }`
                : "aucun achat"
            }
            accent={k.packs30d.cashCents > 0 ? "text-success" : undefined}
          />
          <KpiCard
            label="Welcome credits — 30 j"
            value={eur(k.welcome.cents30d)}
            sub={`${k.welcome.count30d} inscrit${k.welcome.count30d > 1 ? "s" : ""} crédités (coût d'acquisition)`}
            accent={k.welcome.cents30d > 0 ? "text-warning" : undefined}
          />
          <KpiCard
            label="Welcome credits — total"
            value={eur(k.welcome.totalCents)}
            sub={`${k.welcome.totalCount} comptes depuis le début`}
          />
          <KpiCard
            label="Abonnés free"
            value={k.subsByPlan.free > 0 ? k.subsByPlan.free : "—"}
            sub={
              k.subsByPlan.free > 0
                ? "lignes plan free actives"
                : "le plan free n'a pas de ligne d'abonnement"
            }
          />
        </div>
      </section>

      {/* ── 3. Rentabilité runs ── */}
      <section>
        <h2 className="hud-label mb-3">Rentabilité runs — coût API réel vs facturé</h2>
        <div className="hud-card overflow-x-auto p-5">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-left">
                <th className="pb-2 pr-3 text-xs font-medium text-ink-faint">Fenêtre</th>
                <th className="pb-2 pr-3 text-right text-xs font-medium text-ink-faint">Coût API réel</th>
                <th className="pb-2 pr-3 text-right text-xs font-medium text-ink-faint">Facturé</th>
                <th className="pb-2 pr-3 text-right text-xs font-medium text-ink-faint">Marge</th>
                <th className="pb-2 pr-3 text-right text-xs font-medium text-ink-faint">Marge %</th>
                <th className="pb-2 text-right text-xs font-medium text-ink-faint">Runs</th>
              </tr>
            </thead>
            <tbody>
              <EconRow label="7 jours" win={k.econ7d} />
              <EconRow label="30 jours" win={k.econ30d} />
            </tbody>
          </table>
          {k.econ30d.runCount === 0 && (
            <p className="mt-3 text-xs text-ink-faint">
              Aucun run sur crédits enregistré sur 30 jours (les runs BYOK ne passent pas par
              platform_run_economics : coût porté par l&apos;utilisateur).
            </p>
          )}
        </div>

        {k.topCostUsers30d.length > 0 && (
          <div className="hud-card mt-3 overflow-x-auto p-5">
            <p className="mb-3 text-xs font-semibold text-ink-soft">
              Top 10 comptes par coût API (30 j) — repérer les comptes à perte
            </p>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="text-left">
                  <th className="pb-2 pr-3 text-xs font-medium text-ink-faint">Compte</th>
                  <th className="pb-2 pr-3 text-xs font-medium text-ink-faint">Plan</th>
                  <th className="pb-2 pr-3 text-right text-xs font-medium text-ink-faint">Coût API</th>
                  <th className="pb-2 pr-3 text-right text-xs font-medium text-ink-faint">Facturé</th>
                  <th className="pb-2 pr-3 text-right text-xs font-medium text-ink-faint">Marge</th>
                  <th className="pb-2 text-right text-xs font-medium text-ink-faint">Runs</th>
                </tr>
              </thead>
              <tbody>
                {k.topCostUsers30d.map((u) => (
                  <tr key={u.userId} className="border-t border-line">
                    <td className="max-w-[220px] truncate py-2.5 pr-3 text-sm font-medium text-ink">
                      {u.displayName}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          u.plan === "free"
                            ? "border-line text-ink-faint"
                            : "border-accent/30 bg-accent/10 text-accent"
                        }`}
                      >
                        {PLANS[u.plan].label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-sm text-ink">{eur(u.costCents)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-sm text-ink">{eur(u.billedCents)}</td>
                    <td
                      className={`py-2.5 pr-3 text-right font-mono text-sm font-semibold ${
                        u.marginCents < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {eur(u.marginCents)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-sm text-ink-faint">{u.runCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 4. Passif crédits ── */}
      <section>
        <h2 className="hud-label mb-3">Passif crédits</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Dette crédits (soldes positifs)"
            value={eur(k.liability.balanceCents)}
            sub={`${k.liability.holders} compte${k.liability.holders > 1 ? "s" : ""} avec du solde`}
            accent="text-warning"
          />
          <KpiCard label="Holds en cours" value={eur(k.liability.heldCents)} sub="réservé pour des runs actifs" />
          <KpiCard
            label="Passif net exposé"
            value={eur(Math.max(0, k.liability.balanceCents - k.liability.heldCents))}
            sub="solde disponible côté utilisateurs"
          />
          <KpiCard
            label="Soldes anormaux"
            value={k.liability.anomalies}
            sub="balance < 0 ou hold > solde"
            accent={k.liability.anomalies > 0 ? "text-destructive" : "text-success"}
          />
        </div>
      </section>

      {/* ── 5. Usage produit ── */}
      <section>
        <h2 className="hud-label mb-3">Usage produit</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Runs — 7 j"
            value={k.runs7d.total}
            sub={`${k.runs7d.instant} tac au tac · ${k.runs7d.missions} missions`}
          />
          <KpiCard
            label="Taux d'échec — 7 j"
            value={`${runFailRate7d} %`}
            sub={`${k.runs7d.failed} échec${k.runs7d.failed > 1 ? "s" : ""} · ${k.runs7d.completed} ok`}
            accent={runFailRate7d > 20 ? "text-destructive" : runFailRate7d > 10 ? "text-warning" : "text-success"}
          />
          <KpiCard
            label="Taux d'échec — 24 h"
            value={k.runs24h.total > 0 ? `${k.runs24h.failRatePct} %` : "—"}
            sub={`${k.runs24h.failed} / ${k.runs24h.total} runs`}
            accent={
              k.runs24h.failRatePct > 20 ? "text-destructive" : k.runs24h.failRatePct > 10 ? "text-warning" : undefined
            }
          />
          <KpiCard
            label="Actifs — 7 j"
            value={k.activeUsers7d}
            sub="utilisateurs avec ≥ 1 run"
            accent="text-accent"
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="hud-card p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-xs font-semibold text-ink-soft">Runs / jour — 14 jours</p>
              <span className="font-mono text-xs text-ink-faint">
                {k.runsPerDay14d.reduce((s, p) => s + p.count, 0)} au total
              </span>
            </div>
            <BarChart points={k.runsPerDay14d} barClass="bg-accent/80" />
            <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-faint">
              <span>{dayLabel(k.runsPerDay14d[0]?.day ?? "")}</span>
              <span>{dayLabel(k.runsPerDay14d[k.runsPerDay14d.length - 1]?.day ?? "")}</span>
            </div>
            <div className="mt-2 text-xs text-ink-faint">
              Split 7 j : {pct(k.runs7d.instant, k.runs7d.total)} tac au tac ·{" "}
              {pct(k.runs7d.missions, k.runs7d.total)} missions
            </div>
          </div>

          <div className="hud-card p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-xs font-semibold text-ink-soft">Inscriptions / jour — 14 jours</p>
              <span className="font-mono text-xs text-ink-faint">
                {k.signupsPerDay14d.reduce((s, p) => s + p.count, 0)} au total
              </span>
            </div>
            <BarChart points={k.signupsPerDay14d} barClass="bg-success/80" />
            <div className="mt-2 flex justify-between font-mono text-[10px] text-ink-faint">
              <span>{dayLabel(k.signupsPerDay14d[0]?.day ?? "")}</span>
              <span>{dayLabel(k.signupsPerDay14d[k.signupsPerDay14d.length - 1]?.day ?? "")}</span>
            </div>
            <div className="mt-2 text-xs text-ink-faint">
              Chaque inscription coûte {eur(200)} de crédits de bienvenue.
            </div>
          </div>
        </div>
      </section>

      {k.alerts.length === 0 && (
        <p className="text-xs text-ink-faint">Aucune alerte : marges positives, circuit fermé, échecs sous contrôle.</p>
      )}
    </div>
  );
}
