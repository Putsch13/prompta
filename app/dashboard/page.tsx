import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Download,
  Star,
  DollarSign,
  Pencil,
  ExternalLink,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  RotateCcw,
} from "lucide-react";
import type { Metadata } from "next";
import { TypeBadge, PriceTag, fmt } from "@/components/ui";
import { PromoteButton } from "@/components/PromoteButton";
import { BuilderOnboardingChecklist } from "@/components/onboarding/BuilderOnboardingChecklist";
import { creatorNetCents, PLATFORM_COMMISSION_PERCENT } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | Prompta",
};

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

  const { data: stripeAccount } = await supabase
    .from("stripe_accounts")
    .select("charges_enabled, payouts_enabled")
    .eq("profile_id", user.id)
    .maybeSingle();

  const kycComplete =
    stripeAccount?.charges_enabled === true && stripeAccount?.payouts_enabled === true;

  const { data: listings } = await supabase
    .from("listings")
    .select("id, title, slug, type, status, price_cents, created_at, updated_at")
    .eq("creator_id", user.id)
    .order("updated_at", { ascending: false });

  const listingIds = (listings || []).map((l) => l.id);

  const [
    { count: totalDownloads },
    { data: purchases },
    { data: reviews },
    { data: subs },
    { data: recentAgentRuns },
    { count: invalidKeys },
    { data: underReview },
  ] = await Promise.all([
    supabase
      .from("downloads")
      .select("*", { count: "exact", head: true })
      .in("listing_id", listingIds.length ? listingIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("purchases")
      .select("amount_cents, platform_fee_cents, listing_id")
      .in("listing_id", listingIds.length ? listingIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "completed"),
    supabase
      .from("reviews")
      .select("rating, listing_id")
      .in("listing_id", listingIds.length ? listingIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("subscriptions")
      .select("listing_id")
      .in("listing_id", listingIds.length ? listingIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "active"),
    admin
      .from("listing_agent_runs")
      .select("id, status, error_message, created_at, listing_id, listing:listings(title, slug)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("user_api_keys")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("is_valid", false),
    supabase
      .from("listings")
      .select("id, title")
      .eq("creator_id", user.id)
      .eq("status", "under_review"),
  ]);

  const totalSalesCents = (purchases ?? []).reduce((s, p) => s + p.amount_cents, 0);
  const totalCommissionCents = (purchases ?? []).reduce((s, p) => s + p.platform_fee_cents, 0);
  const netRevenueCents = totalSalesCents - totalCommissionCents;

  const { data: listingPrices } = await admin
    .from("listings")
    .select("id, subscription_price_cents")
    .in("id", listingIds.length ? listingIds : ["00000000-0000-0000-0000-000000000000"]);

  const priceMap = Object.fromEntries(
    (listingPrices ?? []).map((l) => [l.id, l.subscription_price_cents ?? 0])
  );
  const mrrCents = (subs ?? []).reduce(
    (s, sub) => s + creatorNetCents(priceMap[sub.listing_id] ?? 0),
    0
  );

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const alerts: { message: string; href: string }[] = [];
  if (!kycComplete) {
    alerts.push({ message: "Complétez Stripe pour vendre du contenu payant", href: "/dashboard/payouts" });
  }
  if ((invalidKeys ?? 0) > 0) {
    alerts.push({ message: `${invalidKeys} clé(s) API invalide(s)`, href: "/dashboard/connexions" });
  }
  if (underReview && underReview.length > 0) {
    alerts.push({
      message: `${underReview.length} contenu(s) en revue`,
      href: `/dashboard/listing/${underReview[0].id}/edit`,
    });
  }
  const recentRunsTyped = (recentAgentRuns ?? []) as {
    id: string;
    status: string;
    listing: { title?: string; slug?: string } | null;
  }[];

  const failedRuns = recentRunsTyped.filter((r) => r.status === "failed");
  if (failedRuns.length > 0) {
    alerts.push({ message: "Des runs agent ont échoué récemment", href: "/dashboard/runs" });
  }

  return (
    <div>
      <div className="mb-6 rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium text-ink">
                Compte Stripe :{" "}
                {kycComplete ? (
                  <span className="text-green-600">✅ connecté</span>
                ) : (
                  <span className="text-amber-600">⚠️ à compléter</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                Connectez votre compte une seule fois. Ensuite, fixez un prix sur vos contenus et la
                commission de {PLATFORM_COMMISSION_PERCENT} % est prélevée automatiquement.
              </p>
            </div>
          </div>
          {!kycComplete && (
            <Link
              href="/dashboard/payouts"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Configurer Stripe
            </Link>
          )}
          {kycComplete && (
            <Link
              href="/dashboard/payouts"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-accent"
            >
              Voir mes revenus
            </Link>
          )}
        </div>
      </div>

      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Bonjour, {profile.display_name}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">@{profile.username} · Espace builder</p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<DollarSign className="h-5 w-5 text-accent" />} label="Ventes cumulées" value={`${(netRevenueCents / 100).toFixed(0)} €`} />
        <StatCard icon={<TrendingUp className="h-5 w-5 text-accent" />} label="MRR abonnements" value={`${(mrrCents / 100).toFixed(0)} €`} sub={`${subs?.length ?? 0} abonné(s)`} />
        <StatCard icon={<CreditCard className="h-5 w-5 text-accent" />} label={`Commission (${PLATFORM_COMMISSION_PERCENT} %)`} value={`${(totalCommissionCents / 100).toFixed(0)} €`} />
        <StatCard icon={<Download className="h-5 w-5 text-accent" />} label="Téléchargements" value={totalDownloads || 0} />
        <StatCard icon={<Star className="h-5 w-5 text-accent" />} label="Note moyenne" value={avgRating > 0 ? avgRating.toFixed(1) : "—"} />
      </div>

      {alerts.length > 0 && (
        <div className="mt-6 space-y-2">
          {alerts.map((a) => (
            <Link
              key={a.message}
              href={a.href}
              className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
            >
              <AlertTriangle className="h-4 w-4" /> {a.message}
            </Link>
          ))}
        </div>
      )}

      <BuilderOnboardingChecklist userId={user.id} kycComplete={kycComplete} />

      {(recentRunsTyped.length > 0) && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Runs récents</h2>
            <Link href="/dashboard/runs" className="text-sm text-accent hover:underline">
              Tout voir
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {recentRunsTyped.map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-lg border border-line bg-card px-4 py-2 text-sm">
                <span>{run.listing?.title ?? "Agent"}</span>
                <span className={run.status === "completed" ? "text-green-600" : run.status === "failed" ? "text-red-600" : "text-amber-600"}>
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Mes contenus</h2>
          <Link href="/dashboard/new" className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            <Plus className="h-4 w-4" /> Ajouter
          </Link>
        </div>

        {!listings || listings.length === 0 ? (
          <div className="mt-6 rounded-xl border-2 border-dashed border-line bg-card p-12 text-center">
            <p className="text-ink-soft">Aucun contenu publié.</p>
            <Link href="/dashboard/new" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> Déposer mon premier contenu
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {await Promise.all(
              listings.map(async (listing) => {
                const [{ count: dl }, { count: sales }, { count: activeSubs }, { data: agentRuns }] =
                  await Promise.all([
                    supabase.from("downloads").select("*", { count: "exact", head: true }).eq("listing_id", listing.id),
                    admin.from("purchases").select("*", { count: "exact", head: true }).eq("listing_id", listing.id).eq("status", "completed"),
                    admin.from("subscriptions").select("*", { count: "exact", head: true }).eq("listing_id", listing.id).eq("status", "active"),
                    admin.from("listing_agent_runs").select("status").eq("listing_id", listing.id),
                  ]);
                const listingReviews = (reviews ?? []).filter((r) => r.listing_id === listing.id);
                const rating =
                  listingReviews.length > 0
                    ? listingReviews.reduce((s, r) => s + r.rating, 0) / listingReviews.length
                    : null;
                const runsOk = (agentRuns ?? []).filter((r) => r.status === "completed").length;
                const runsFail = (agentRuns ?? []).filter((r) => r.status === "failed").length;

                return (
                  <div key={listing.id} className="rounded-xl border border-line bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <TypeBadge type={listing.type as "prompt" | "agent" | "workflow"} size="sm" />
                        <div>
                          <h3 className="font-medium text-ink">{listing.title}</h3>
                          <p className="text-xs text-ink-faint">
                            {dl ?? 0} vues/dl · {sales ?? 0} ventes · {activeSubs ?? 0} abonnés
                            {rating != null && ` · ${rating.toFixed(1)} ★`}
                            {(listing.type === "agent" || listing.type === "workflow") &&
                              ` · ${runsOk} runs OK / ${runsFail} échecs`}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={listing.status ?? "draft"} />
                        <PriceTag priceCents={listing.price_cents ?? 0} size="sm" />
                        <Link href={`/dashboard/listing/${listing.id}/edit`} className="rounded-lg border border-line p-2 hover:bg-card2" title="Éditer">
                          <Pencil className="h-4 w-4 text-ink-faint" />
                        </Link>
                        <Link href={`/dashboard/new?fork=${listing.id}`} className="rounded-lg border border-line p-2 hover:bg-card2" title="Nouvelle version">
                          <RotateCcw className="h-4 w-4 text-ink-faint" />
                        </Link>
                        {listing.status === "published" && (
                          <>
                            <PromoteButton slug={listing.slug} title={listing.title} />
                            <Link href={`/listing/${listing.slug}`} className="rounded-lg border border-line p-2 hover:bg-card2" title="Voir la fiche">
                              <ExternalLink className="h-4 w-4 text-ink-faint" />
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-ink-soft">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-ink">
        {typeof value === "number" ? fmt(value) : value}
      </p>
      {sub && <p className="text-xs text-ink-faint">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-card2 text-ink-soft",
    under_review: "bg-amber-50 text-amber-700",
    published: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };
  const labels: Record<string, string> = {
    draft: "Brouillon",
    under_review: "En revue",
    published: "Publié",
    rejected: "Refusé",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.draft}`}>
      {labels[status] || status}
    </span>
  );
}
