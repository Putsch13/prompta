import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PromptCard } from "@/components/PromptCard";

export const revalidate = 3600;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://prompta.app";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const supabase = await createClient();
  const { data: category } = await supabase
    .from("categories")
    .select("name, slug")
    .eq("slug", params.slug)
    .single();

  if (!category) return { title: "Catégorie introuvable" };

  const canonicalUrl = `${APP_URL}/c/${category.slug}`;

  return {
    title: `${category.name} — Prompts & Agents IA | Prompta`,
    description: `Découvrez les meilleurs prompts, agents et workflows IA pour ${category.name}. Bundles complets avec environnement, publiés par des builders vérifiés.`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${category.name} — Prompts & Agents IA`,
      description: `Découvrez les meilleurs prompts IA pour ${category.name}.`,
      type: "website",
      url: canonicalUrl,
    },
  };
}

export default async function CategoryPage(props: Props) {
  const params = await props.params;
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("id, name, slug, icon")
    .eq("slug", params.slug)
    .single();

  if (!category) notFound();

  const { data: listings } = await supabase
    .from("listings")
    .select("id, slug, title, type, description, price_cents, creator_id")
    .eq("category_id", category.id)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(50);

  const listingIds = (listings || []).map((l) => l.id);
  const creatorIds = Array.from(new Set((listings || []).map((l) => l.creator_id)));

  const { data: reviews } = listingIds.length > 0
    ? await supabase
        .from("reviews")
        .select("listing_id, rating")
        .in("listing_id", listingIds)
    : { data: [] };

  const { data: downloads } = listingIds.length > 0
    ? await supabase
        .from("downloads")
        .select("listing_id")
        .in("listing_id", listingIds)
    : { data: [] };

  const { data: creators } = creatorIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", creatorIds)
    : { data: [] };

  const reviewsByListing = (reviews || []).reduce<Record<string, number[]>>(
    (acc, r) => {
      if (!acc[r.listing_id]) acc[r.listing_id] = [];
      acc[r.listing_id].push(r.rating);
      return acc;
    },
    {}
  );

  const downloadsByListing = (downloads || []).reduce<Record<string, number>>(
    (acc, d) => {
      acc[d.listing_id] = (acc[d.listing_id] || 0) + 1;
      return acc;
    },
    {}
  );

  type CreatorProfile = { id: string; username: string; display_name: string; avatar_url: string | null };
  const creatorsMap = (creators || []).reduce<Record<string, CreatorProfile>>(
    (acc, c) => {
      acc[c.id] = c;
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          {category.icon && <span className="mb-4 block text-5xl">{category.icon}</span>}
          <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
            {category.name}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-ink-soft">
            Découvrez les meilleurs prompts, agents et workflows IA pour {category.name}.
            Bundles complets avec environnement, publiés par des builders vérifiés.
          </p>
        </div>

        {(!listings || listings.length === 0) ? (
          <p className="py-16 text-center text-ink-soft">
            Aucun prompt publié dans cette catégorie pour le moment.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => {
              const ratings = reviewsByListing[listing.id] || [];
              const avgRating = ratings.length > 0
                ? ratings.reduce((s, r) => s + r, 0) / ratings.length
                : undefined;
              const dlCount = downloadsByListing[listing.id] || 0;
              const creator = creatorsMap[listing.creator_id];

              return (
                <PromptCard
                  key={listing.id}
                  slug={listing.slug}
                  title={listing.title}
                  type={listing.type as "prompt" | "agent" | "workflow"}
                  description={listing.description || ""}
                  priceCents={listing.price_cents ?? 0}
                  rating={avgRating}
                  reviewCount={ratings.length}
                  downloads={dlCount}
                  creator={creator ? {
                    display_name: creator.display_name,
                    username: creator.username,
                    avatar_url: creator.avatar_url,
                  } : null}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
