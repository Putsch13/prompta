import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CheckCircle, XCircle, AlertTriangle, Eye, Flag } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface ListingForReview {
  id: string;
  title: string;
  slug: string;
  type: "prompt" | "agent" | "workflow";
  description: string | null;
  content_flags: unknown;
  created_at: string;
  creator: {
    username: string;
    display_name: string;
  } | null;
}

interface ModerationFlag {
  id: string;
  reason: string | null;
  status: string;
  created_at: string;
  listing: {
    id: string;
    title: string;
    slug: string;
  } | null;
  reporter: {
    username: string;
    display_name: string;
  } | null;
}

export default async function ModerationPage() {
  await requireAdmin();

  const supabase = createClient();

  const { data: pendingListings } = await supabase
    .from("listings")
    .select(
      `
      id,
      title,
      slug,
      type,
      description,
      content_flags,
      created_at,
      creator:profiles!listings_creator_id_fkey(username, display_name)
    `
    )
    .eq("status", "under_review")
    .order("created_at", { ascending: true });

  const { data: openFlags } = await supabase
    .from("moderation_flags")
    .select(
      `
      id,
      reason,
      status,
      created_at,
      listing:listings(id, title, slug),
      reporter:profiles!moderation_flags_flagged_by_fkey(username, display_name)
    `
    )
    .eq("status", "open")
    .order("created_at", { ascending: true });

  const listings = (pendingListings ?? []) as unknown as ListingForReview[];
  const flags = (openFlags ?? []) as unknown as ModerationFlag[];

  return (
    <div className="mx-auto max-w-page px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-ink">
          Modération
        </h1>
        <p className="mt-2 text-ink-soft">
          Approuve ou refuse les contenus en attente de validation.
        </p>
      </div>

      <div className="mb-8 flex gap-4 border-b border-line">
        <button className="border-b-2 border-accent px-4 py-3 text-sm font-medium text-accent">
          En attente ({listings.length})
        </button>
        <Link
          href="#signalements"
          className="px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink"
        >
          Signalements ({flags.length})
        </Link>
      </div>

      {listings.length === 0 ? (
        <div className="rounded-xl border border-line bg-card p-8 text-center">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <p className="mt-4 font-display text-lg font-semibold text-ink">
            Aucun contenu en attente
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Tous les contenus ont été modérés.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => {
            const contentFlags = Array.isArray(listing.content_flags)
              ? (listing.content_flags as string[])
              : [];
            const hasContentFlags = contentFlags.length > 0;

            return (
              <div
                key={listing.id}
                className="rounded-xl border border-line bg-card p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          listing.type === "prompt"
                            ? "bg-blue-100 text-blue-700"
                            : listing.type === "agent"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {listing.type}
                      </span>
                      <h3 className="font-display text-lg font-semibold text-ink">
                        {listing.title}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">
                      Par{" "}
                      <span className="font-medium">
                        {listing.creator?.display_name ?? "Inconnu"}
                      </span>{" "}
                      (@{listing.creator?.username ?? "?"}) •{" "}
                      {new Date(listing.created_at).toLocaleDateString("fr-FR")}
                    </p>
                    {listing.description && (
                      <p className="mt-3 line-clamp-2 text-sm text-ink-soft">
                        {listing.description}
                      </p>
                    )}
                    {hasContentFlags && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          Flags de contenu :{" "}
                          {contentFlags.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/listing/${listing.slug}`}
                      target="_blank"
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink-soft hover:bg-card2"
                    >
                      <Eye className="h-4 w-4" />
                      Voir
                    </Link>
                    <form action={`/api/admin/moderate`} method="POST">
                      <input type="hidden" name="listingId" value={listing.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button
                        type="submit"
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-sm font-medium text-white hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approuver
                      </button>
                    </form>
                    <form action={`/api/admin/moderate`} method="POST">
                      <input type="hidden" name="listingId" value={listing.id} />
                      <input type="hidden" name="action" value="reject" />
                      <button
                        type="submit"
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700"
                      >
                        <XCircle className="h-4 w-4" />
                        Refuser
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div id="signalements" className="mt-12">
        <h2 className="font-display text-2xl font-bold text-ink">
          Signalements
        </h2>
        <p className="mt-2 text-ink-soft">
          Contenus signalés par les utilisateurs.
        </p>

        {flags.length === 0 ? (
          <div className="mt-6 rounded-xl border border-line bg-card p-8 text-center">
            <Flag className="mx-auto h-12 w-12 text-ink-faint" />
            <p className="mt-4 font-display text-lg font-semibold text-ink">
              Aucun signalement ouvert
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {flags.map((flag) => (
              <div
                key={flag.id}
                className="rounded-xl border border-line bg-card p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-display font-semibold text-ink">
                      {flag.listing?.title ?? "Listing supprimé"}
                    </h3>
                    <p className="mt-1 text-sm text-ink-soft">
                      Signalé par{" "}
                      {flag.reporter?.display_name ?? "Anonyme"} •{" "}
                      {new Date(flag.created_at).toLocaleDateString("fr-FR")}
                    </p>
                    {flag.reason && (
                      <p className="mt-3 rounded-lg bg-card2 px-3 py-2 text-sm text-ink-soft">
                        &quot;{flag.reason}&quot;
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {flag.listing && (
                      <Link
                        href={`/listing/${flag.listing.slug}`}
                        target="_blank"
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink-soft hover:bg-card2"
                      >
                        <Eye className="h-4 w-4" />
                        Voir
                      </Link>
                    )}
                    <form action={`/api/admin/moderate`} method="POST">
                      <input type="hidden" name="flagId" value={flag.id} />
                      <input type="hidden" name="action" value="resolve" />
                      <button
                        type="submit"
                        className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-accent/90"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Traité
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
