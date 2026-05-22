import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Settings, Download, Star, Eye, Pencil } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
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
    .select("id, title, slug, type, status, price_cents, created_at, updated_at")
    .eq("creator_id", user.id)
    .order("updated_at", { ascending: false });

  const listingIds = (listings || []).map((l) => l.id);

  const { count: totalDownloads } = await supabase
    .from("downloads")
    .select("*", { count: "exact", head: true })
    .in("listing_id", listingIds.length > 0 ? listingIds : ["00000000-0000-0000-0000-000000000000"]);

  const { count: totalPurchases } = await supabase
    .from("purchases")
    .select("*", { count: "exact", head: true })
    .in("listing_id", listingIds.length > 0 ? listingIds : ["00000000-0000-0000-0000-000000000000"]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Bonjour, {profile.display_name} 👋
          </h1>
          <p className="mt-1 text-sm text-muted">
            @{profile.username} · Ton espace builder
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/edit-profile"
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent-light"
          >
            <Settings className="h-4 w-4" />
            Modifier profil
          </Link>
          <Link
            href="/dashboard/new"
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" />
            Nouveau prompt
          </Link>
        </div>
      </div>

      {/* Stats */}
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
          label="Ventes"
          value={totalPurchases || 0}
        />
        <StatCard
          icon={<Star className="h-5 w-5 text-accent" />}
          label="Revenus"
          value="—"
        />
      </div>

      {/* Liste des listings */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold">Mes prompts & agents</h2>

        {!listings || listings.length === 0 ? (
          <div className="mt-8 rounded-xl border-2 border-dashed border-border p-12 text-center">
            <p className="text-muted">Tu n&apos;as pas encore de prompt.</p>
            <Link
              href="/dashboard/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
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
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/30"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block rounded bg-accent-light px-2 py-0.5 text-xs font-medium text-accent">
                    {listing.type}
                  </span>
                  <div>
                    <h3 className="font-medium">{listing.title}</h3>
                    <p className="text-xs text-muted">
                      Mis à jour le{" "}
                      {new Date(listing.updated_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={listing.status} />
                  <span className="text-sm font-medium">
                    {listing.price_cents === 0
                      ? "Gratuit"
                      : `${(listing.price_cents / 100).toFixed(2)} €`}
                  </span>
                  <Pencil className="h-4 w-4 text-muted" />
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
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-muted">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    under_review: "bg-yellow-100 text-yellow-800",
    published: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
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
