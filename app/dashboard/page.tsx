import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Download, Star, Eye, DollarSign, Pencil } from "lucide-react";
import type { Metadata } from "next";
import { TypeBadge, PriceTag, fmt } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | Prompta",
};

export default async function DashboardPage() {
  const supabase = createClient();

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

  const { data: listings } = await supabase
    .from("listings")
    .select(
      "id, title, slug, type, status, price_cents, created_at, updated_at"
    )
    .eq("creator_id", user.id)
    .order("updated_at", { ascending: false });

  const listingIds = (listings || []).map((l) => l.id);

  const { count: totalDownloads } = await supabase
    .from("downloads")
    .select("*", { count: "exact", head: true })
    .in(
      "listing_id",
      listingIds.length > 0 ? listingIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const { count: totalPurchases } = await supabase
    .from("purchases")
    .select("*", { count: "exact", head: true })
    .in(
      "listing_id",
      listingIds.length > 0 ? listingIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .in(
      "listing_id",
      listingIds.length > 0 ? listingIds : ["00000000-0000-0000-0000-000000000000"]
    );

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Bonjour, {profile.display_name}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            @{profile.username} · Ton espace builder
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<Eye className="h-5 w-5 text-accent" />}
          label="Prompts"
          value={listings?.length || 0}
        />
        <StatCard
          icon={<Download className="h-5 w-5 text-accent" />}
          label="Téléchargements"
          value={totalDownloads || 0}
        />
        <StatCard
          icon={<Star className="h-5 w-5 text-accent" />}
          label="Note moyenne"
          value={avgRating > 0 ? avgRating.toFixed(1) : "—"}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-accent" />}
          label="Ventes"
          value={totalPurchases || 0}
        />
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">
            Mes prompts & agents
          </h2>
          <Link
            href="/dashboard/new"
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </Link>
        </div>

        {!listings || listings.length === 0 ? (
          <div className="mt-6 rounded-xl border-2 border-dashed border-line bg-card p-12 text-center">
            <p className="text-ink-soft">Tu n&apos;as pas encore de prompt.</p>
            <Link
              href="/dashboard/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              <Plus className="h-4 w-4" />
              Déposer mon premier prompt
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/dashboard/listing/${listing.id}/edit`}
                className="flex items-center justify-between rounded-xl border border-line bg-card p-4 transition-colors hover:border-accent/50 hover:shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <TypeBadge
                    type={listing.type as "prompt" | "agent" | "workflow"}
                    size="sm"
                  />
                  <div>
                    <h3 className="font-medium text-ink">{listing.title}</h3>
                    <p className="text-xs text-ink-faint">
                      Mis à jour le{" "}
                      {new Date(listing.updated_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={listing.status} />
                  <PriceTag priceCents={listing.price_cents} size="sm" />
                  <Pencil className="h-4 w-4 text-ink-faint" />
                </div>
              </Link>
            ))}
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
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
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.draft}`}
    >
      {labels[status] || status}
    </span>
  );
}
