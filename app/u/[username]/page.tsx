import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { MapPin, Calendar, BadgeCheck } from "lucide-react";
import { FollowButton } from "@/components/FollowButton";

export const dynamic = "force-dynamic";

interface Props {
  params: { username: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, headline, username")
    .eq("username", params.username)
    .single();

  if (!profile) return { title: "Profil introuvable" };

  return {
    title: `${profile.display_name} (@${profile.username})`,
    description: profile.headline || `Profil de ${profile.display_name} sur Prompta`,
  };
}

export default async function ProfilePage({ params }: Props) {
  const supabase = createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", params.username)
    .single();

  if (!profile) notFound();

  const { data: { user } } = await supabase.auth.getUser();
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
    .select("id, title, slug, type, price_cents, currency, created_at")
    .eq("creator_id", profile.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const { count: totalDownloads } = await supabase
    .from("downloads")
    .select("*", { count: "exact", head: true })
    .in(
      "listing_id",
      (listings || []).map((l) => l.id)
    );

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header profil */}
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-light text-3xl font-bold text-accent">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.display_name}
              width={96}
              height={96}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            profile.display_name.charAt(0).toUpperCase()
          )}
        </div>

        <div className="flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-2xl font-bold">{profile.display_name}</h1>
            {profile.is_verified && (
              <BadgeCheck className="h-5 w-5 text-accent" />
            )}
            {!isOwnProfile && (
              <FollowButton creatorId={profile.id} initialFollowing={isFollowing} />
            )}
          </div>
          <p className="text-sm text-muted">@{profile.username}</p>
          {profile.headline && (
            <p className="mt-2 text-base">{profile.headline}</p>
          )}
          {profile.bio && (
            <p className="mt-2 text-sm text-muted">{profile.bio}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-muted sm:justify-start">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {profile.location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Membre depuis{" "}
              {new Date(profile.created_at).toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>

          {/* Stats */}
          <div className="mt-4 flex items-center justify-center gap-6 sm:justify-start">
            <div className="text-center">
              <p className="text-lg font-bold">{listings?.length || 0}</p>
              <p className="text-xs text-muted">Prompts</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{followersCount || 0}</p>
              <p className="text-xs text-muted">Abonnés</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{totalDownloads || 0}</p>
              <p className="text-xs text-muted">Téléchargements</p>
            </div>
          </div>
        </div>
      </div>

      {/* Listings publiés */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold">Prompts & Agents publiés</h2>

        {!listings || listings.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">
            Aucun prompt publié pour le moment.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {listings.map((listing) => (
              <a
                key={listing.id}
                href={`/listing/${listing.slug}`}
                className="rounded-xl border border-border bg-card p-5 transition-all hover:border-accent hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block rounded bg-accent-light px-2 py-0.5 text-xs font-medium text-accent">
                      {listing.type}
                    </span>
                    <h3 className="mt-2 font-semibold">{listing.title}</h3>
                  </div>
                  <span className="text-sm font-medium">
                    {listing.price_cents === 0
                      ? "Gratuit"
                      : `${(listing.price_cents / 100).toFixed(2)} €`}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
