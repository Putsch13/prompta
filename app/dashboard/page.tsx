import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Bot,
  Coins,
  ClipboardCheck,
  Activity,
  Pencil,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import type { Metadata } from "next";
import { StatusPill, statusTone } from "@/components/ui";
import { BuilderOnboardingChecklist } from "@/components/onboarding/BuilderOnboardingChecklist";
import { getUserPlan, publishedAgentCount } from "@/lib/billing/entitlements";
import { getCreditBalance } from "@/lib/credits";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | Prompta",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  running: "En cours",
  awaiting_approval: "Validation requise",
  completed: "Terminé",
  failed: "Échoué",
  suspended: "Suspendu",
  cancelled: "Annulé",
};

function StatCard({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="h-full rounded-2xl border border-line bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2 text-ink-soft">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-faint">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/onboarding");

  // Crédits de bienvenue (2 €) promis à l'inscription — idempotent
  // (clé welcome_<userId>), crédité au premier passage sur le dashboard.
  const { grantWelcomeCredits } = await import("@/lib/billing/entitlements");
  await grantWelcomeCredits(user.id);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    planInfo,
    published,
    balanceCents,
    { data: agents },
    { count: runsWeek },
    { count: failedWeek },
    { count: pendingApprovals },
    { data: recentRuns },
    { count: invalidKeys },
  ] = await Promise.all([
    getUserPlan(user.id),
    publishedAgentCount(user.id),
    getCreditBalance(user.id),
    admin
      .from("listings")
      .select("id, title, slug, type, status, updated_at")
      .eq("creator_id", user.id)
      .neq("type", "prompt")
      .order("updated_at", { ascending: false })
      .limit(8),
    admin
      .from("listing_agent_runs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gt("created_at", weekAgo),
    admin
      .from("listing_agent_runs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "failed")
      .gt("created_at", weekAgo),
    admin
      .from("agent_approvals")
      .select("*, listing_agent_runs!inner(user_id)", { count: "exact", head: true })
      .eq("listing_agent_runs.user_id", user.id)
      .eq("status", "pending"),
    admin
      .from("listing_agent_runs")
      .select("id, status, created_at, listing:listings(title)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
    admin
      .from("user_api_keys")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("is_valid", false),
  ]);

  const alerts: { message: string; href: string }[] = [];
  if ((pendingApprovals ?? 0) > 0) {
    alerts.push({
      message: `${pendingApprovals} validation(s) en attente — un agent est en pause`,
      href: "/dashboard/validations",
    });
  }
  if ((failedWeek ?? 0) > 0) {
    alerts.push({
      message: `${failedWeek} run(s) en échec cette semaine — l'IA peut les réparer`,
      href: "/dashboard/runs",
    });
  }
  if ((invalidKeys ?? 0) > 0) {
    alerts.push({ message: `${invalidKeys} clé(s) API invalide(s)`, href: "/dashboard/connexions" });
  }

  const quotaLabel =
    planInfo.unrestricted || planInfo.plan.publishedAgentLimit == null
      ? `${published}`
      : `${published} / ${planInfo.plan.publishedAgentLimit}`;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Bonjour, {profile.display_name}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Plan {planInfo.plan.label}
            {planInfo.unrestricted ? " · illimité" : ""} — tes agents travaillent, tu supervises.
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Nouvel agent
        </Link>
      </div>

      {alerts.length > 0 && (
        <div className="mt-5 space-y-2">
          {alerts.map((a) => (
            <Link
              key={a.href + a.message}
              href={a.href}
              className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 hover:border-amber-300"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{a.message}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Bot className="h-4 w-4" />}
          label="Agents en production"
          value={quotaLabel}
          sub={planInfo.plan.publishedAgentLimit == null || planInfo.unrestricted ? "illimité" : `plan ${planInfo.plan.label}`}
          href="/dashboard/contenus"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Runs sur 7 jours"
          value={runsWeek ?? 0}
          sub={failedWeek ? `${failedWeek} échec(s)` : "aucun échec"}
          href="/dashboard/runs"
        />
        <StatCard
          icon={<ClipboardCheck className="h-4 w-4" />}
          label="Validations"
          value={pendingApprovals ?? 0}
          sub="en attente de ton feu vert"
          href="/dashboard/validations"
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="Crédits IA"
          value={`${(Math.max(0, balanceCents) / 100).toFixed(2)} €`}
          sub={planInfo.plan.monthlyCreditCents > 0 ? `+${(planInfo.plan.monthlyCreditCents / 100).toFixed(0)} €/mois inclus` : "recharge ou BYOK"}
          href="/dashboard/credits"
        />
      </div>

      <BuilderOnboardingChecklist userId={user.id} kycComplete={true} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* ── Runs récents ── */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Runs récents</h2>
            <Link href="/dashboard/runs" className="text-sm text-accent hover:underline">
              Tout voir →
            </Link>
          </div>
          {(recentRuns ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              Aucun run pour l&apos;instant — lance ton premier agent.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line-soft">
              {(recentRuns ?? []).map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/runs/${r.id}`}
                    className="flex items-center gap-3 py-2.5 hover:bg-card2/50"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {(r.listing as { title?: string } | null)?.title ?? "Agent"}
                    </span>
                    <StatusPill tone={statusTone(r.status)}>
                      {RUN_STATUS_LABELS[r.status] ?? r.status}
                    </StatusPill>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {new Date(r.created_at ?? Date.now()).toLocaleDateString("fr-FR")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Mes agents ── */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Mes agents</h2>
            <Link href="/dashboard/contenus" className="text-sm text-accent hover:underline">
              Tout voir →
            </Link>
          </div>
          {(agents ?? []).length === 0 ? (
            <div className="mt-4">
              <p className="text-sm text-ink-soft">
                Décris ton objectif, le copilote construit l&apos;agent.
              </p>
              <Link
                href="/dashboard/new"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <Plus className="h-4 w-4" /> Créer mon premier agent
              </Link>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line-soft">
              {(agents ?? []).map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.title}</span>
                  <StatusPill
                    tone={a.status === "published" ? "success" : a.status === "under_review" ? "warning" : "neutral"}
                  >
                    {a.status === "published"
                      ? "En production"
                      : a.status === "under_review"
                        ? "En revue"
                        : "Brouillon"}
                  </StatusPill>
                  <Link
                    href={`/dashboard/listing/${a.id}/edit`}
                    className="shrink-0 rounded-lg border border-line p-1.5 text-ink-soft hover:border-accent hover:text-accent"
                    aria-label="Éditer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
