import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  MapPin,
  Users,
  CheckCircle2,
  Download,
  Star,
  FileText,
  DollarSign,
  MessageSquare,
} from "lucide-react";
import { FollowButton } from "@/components/FollowButton";
import { PromptCard } from "@/components/PromptCard";
import { Avatar, BadgePill, fmt } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, headline, username")
    .eq("username", params.username)
    .single();

  if (!profile) return { title: "Profil introuvable" };

  return {
    title: `${profile.display_name} (@${profile.username}) | Prompta`,
    description:
      profile.headline || `Profil de ${profile.display_name} sur Prompta`,
  };
}

export default async function ProfilePage(props: Props) {
  const params = await props.params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", params.username)
    .single();

  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwnProfile = user?.id === profile.id;

  let isFollowing = false;
  if (user && !isOwnProfile) {
    const { data: follow } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("creator_id", profile.id)
      .maybeSingle();
    isFollowing = !!follow;
  }

  const { count: followersCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("creator_id", profile.id);

  const { data: listings } = await supabase
    .from("listings")
    .select(
      "id, title, slug, type, price_cents, description, created_at, creator_id"
    )
    .eq("creator_id", profile.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const listingIds = (listings || []).map((l) => l.id);

  const { count: totalDownloads } = await supabase
    .from("downloads")
    .select("*", { count: "exact", head: true })
    .in("listing_id", listingIds.length > 0 ? listingIds : ["none"]);

  const { data: allReviews } = await supabase
    .from("reviews")
    .select("rating, listing_id")
    .in("listing_id", listingIds.length > 0 ? listingIds : ["none"]);

  const avgRating =
    allReviews && allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : 0;

  const { data: creatorBadgesData } = await supabase
    .from("creator_badges")
    .select("badge_id")
    .eq("creator_id", profile.id);

  const badgeIds = (creatorBadgesData ?? []).map((b) => b.badge_id);

  const { data: badgesData } = badgeIds.length > 0
    ? await supabase
        .from("badges")
        .select("slug, label")
        .in("id", badgeIds)
    : { data: [] };

  const badges = badgesData ?? [];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const linkedInShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    `${appUrl}/u/${profile.username}`
  )}`;

  return (
    <div className="min-h-screen bg-bg">
      <div
        className="h-[100px] w-full"
        style={{
          background: "linear-gradient(115deg, #0A66C2 0%, #378FE9 100%)",
        }}
      />

      <div className="mx-auto max-w-page px-4 sm:px-6 lg:px-8">
        <div className="-mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <div className="rounded-full border-4 border-white bg-white shadow-lg">
              <Avatar
                name={profile.display_name}
                url={profile.avatar_url}
                size={86}
              />
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-ink">
                  {profile.display_name}
                </h1>
                {profile.is_verified && (
                  <CheckCircle2 className="h-5 w-5 fill-accent text-white" />
                )}
              </div>
              <p className="text-sm text-ink-soft">@{profile.username}</p>
            </div>
          </div>

          {!isOwnProfile && (
            <div className="flex gap-2">
              <FollowButton
                creatorId={profile.id}
                initialFollowing={isFollowing}
              />
              <button className="flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-medium text-ink hover:bg-card2">
                <MessageSquare className="h-4 w-4" />
                Message
              </button>
            </div>
          )}

          {isOwnProfile && (
            <Link
              href="/dashboard/edit-profile"
              className="flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-medium text-ink hover:bg-card2"
            >
              Modifier le profil
            </Link>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-ink-soft">
          {profile.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {profile.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {fmt(followersCount || 0)} abonnés
          </span>
        </div>

        {profile.headline && (
          <p className="mt-3 text-base text-ink">{profile.headline}</p>
        )}

        {profile.bio && (
          <p className="mt-2 text-sm text-ink-soft">{profile.bio}</p>
        )}

        {badges && badges.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {badges.map((badge, i) => {
              if (!badge.slug || !badge.label) return null;
              return (
                <BadgePill key={badge.slug} variant={i === 0 ? "primary" : "secondary"}>
                  {badge.label}
                </BadgePill>
              );
            })}
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-card p-4 text-center">
            <Download className="mx-auto h-5 w-5 text-accent" />
            <p className="mt-2 font-display text-2xl font-bold text-ink">
              {fmt(totalDownloads || 0)}
            </p>
            <p className="text-xs text-ink-soft">Téléchargements</p>
          </div>
          <div className="rounded-xl border border-line bg-card p-4 text-center">
            <Star className="mx-auto h-5 w-5 text-accent" />
            <p className="mt-2 font-display text-2xl font-bold text-ink">
              {avgRating > 0 ? avgRating.toFixed(1) : "—"}
            </p>
            <p className="text-xs text-ink-soft">Note moyenne</p>
          </div>
          <div className="rounded-xl border border-line bg-card p-4 text-center">
            <FileText className="mx-auto h-5 w-5 text-accent" />
            <p className="mt-2 font-display text-2xl font-bold text-ink">
              {listings?.length || 0}
            </p>
            <p className="text-xs text-ink-soft">Prompts publiés</p>
          </div>
          <div className="rounded-xl border border-line bg-card p-4 text-center">
            <DollarSign className="mx-auto h-5 w-5 text-accent" />
            <p className="mt-2 font-display text-2xl font-bold text-ink">—</p>
            <p className="text-xs text-ink-soft">Revenus</p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-accent bg-accent-light p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display font-semibold text-ink">
                Transformez votre réputation en preuve professionnelle
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Partagez votre profil Prompta sur LinkedIn
              </p>
            </div>
            <a
              href={linkedInShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center gap-2 rounded-lg bg-[#0077B5] px-4 text-sm font-medium text-white hover:bg-[#006097]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              Partager
            </a>
          </div>
        </div>

        <div className="mt-10">
          <div className="flex gap-6 border-b border-line">
            <button className="border-b-2 border-accent px-1 pb-3 text-sm font-medium text-accent">
              Prompts
            </button>
            <button className="px-1 pb-3 text-sm font-medium text-ink-soft hover:text-ink">
              Avis ({allReviews?.length || 0})
            </button>
            <button className="px-1 pb-3 text-sm font-medium text-ink-soft hover:text-ink">
              Activité
            </button>
          </div>

          <div className="mt-6">
            {!listings || listings.length === 0 ? (
              <p className="py-12 text-center text-sm text-ink-soft">
                Aucun prompt publié pour le moment.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <PromptCard
                    key={listing.id}
                    slug={listing.slug}
                    title={listing.title}
                    type={listing.type as "prompt" | "agent" | "workflow"}
                    priceCents={listing.price_cents ?? 0}
                    description={listing.description}
                    creator={{
                      username: profile.username,
                      display_name: profile.display_name,
                      avatar_url: profile.avatar_url,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
