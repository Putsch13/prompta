import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PromptCard } from "@/components/PromptCard";
import { fmt } from "@/components/ui";
import { Download, Star, FileText, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ username: string }>;
}

export default async function SynthesePage(props: Props) {
  const params = await props.params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, headline, is_verified")
    .eq("username", params.username)
    .single();

  if (!profile) notFound();

  const { data: listings } = await supabase
    .from("listings")
    .select("id, slug, title, type, description, price_cents")
    .eq("creator_id", profile.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(3);

  const listingIds = (listings ?? []).map((l) => l.id);

  const { count: totalDownloads } = listingIds.length > 0
    ? await supabase
        .from("downloads")
        .select("*", { count: "exact", head: true })
        .in("listing_id", listingIds)
    : { count: 0 };

  const { data: reviews } = listingIds.length > 0
    ? await supabase.from("reviews").select("rating").in("listing_id", listingIds)
    : { data: [] };

  const avgRating =
    reviews && reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : null;

  const { data: badgeRows } = await supabase
    .from("creator_badges")
    .select("badge_id")
    .eq("creator_id", profile.id);

  const badgeIds = (badgeRows ?? []).map((b) => b.badge_id);
  const { data: badgeDetails } = badgeIds.length > 0
    ? await supabase.from("badges").select("label").in("id", badgeIds)
    : { data: [] };

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-page px-4 py-12">
        <div className="rounded-xl border border-accent bg-accent-light/30 p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-accent">
            Fiche synthèse Prompta
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-ink">
            {profile.display_name}
            {profile.is_verified && " ✓"}
          </h1>
          {profile.headline && (
            <p className="mt-2 text-lg text-ink-soft">{profile.headline}</p>
          )}

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-card p-4 text-center">
              <Download className="mx-auto h-5 w-5 text-accent" />
              <p className="mt-2 font-display text-2xl font-bold text-ink">
                {fmt(totalDownloads ?? 0)}
              </p>
              <p className="text-xs text-ink-soft">Téléchargements</p>
            </div>
            <div className="rounded-lg bg-card p-4 text-center">
              <Star className="mx-auto h-5 w-5 text-accent" />
              <p className="mt-2 font-display text-2xl font-bold text-ink">
                {avgRating ? avgRating.toFixed(1) : "—"}
              </p>
              <p className="text-xs text-ink-soft">Note moyenne</p>
            </div>
            <div className="rounded-lg bg-card p-4 text-center">
              <FileText className="mx-auto h-5 w-5 text-accent" />
              <p className="mt-2 font-display text-2xl font-bold text-ink">
                {listings?.length ?? 0}
              </p>
              <p className="text-xs text-ink-soft">Prompts publiés</p>
            </div>
            <div className="rounded-lg bg-card p-4 text-center">
              <TrendingUp className="mx-auto h-5 w-5 text-accent" />
              <p className="mt-2 font-display text-2xl font-bold text-ink">
                {badgeDetails?.length ?? 0}
              </p>
              <p className="text-xs text-ink-soft">Badges</p>
            </div>
          </div>

          {(badgeDetails ?? []).length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {(badgeDetails ?? []).map((b, i) => (
                <span
                  key={i}
                  className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-white"
                >
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {(listings ?? []).length > 0 && (
          <div className="mt-10">
            <h2 className="font-display text-xl font-bold text-ink">
              Top prompts
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {(listings ?? []).map((l) => (
                <PromptCard
                  key={l.id}
                  slug={l.slug}
                  title={l.title}
                  type={l.type as "prompt" | "agent" | "workflow"}
                  description={l.description ?? ""}
                  priceCents={l.price_cents ?? 0}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 flex gap-4">
          <Link
            href={`/u/${profile.username}`}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-card2"
          >
            Voir le profil
          </Link>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
              `${process.env.NEXT_PUBLIC_APP_URL}/u/${profile.username}/synthese`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Partager sur LinkedIn
          </a>
        </div>
      </div>
    </div>
  );
}
