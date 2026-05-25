/**
 * Générateur d'avis intelligents pour démo/staging.
 * 
 * ⚠️ AVERTISSEMENT : Afficher de faux avis à de vrais clients est interdit
 * (directive Omnibus UE). Ce seed est uniquement pour environnements de démo.
 * 
 * Distribution en loi de puissance (Pareto) :
 * - ~10% des prompts = "hits" → 60-200 avis
 * - ~30% = engagement moyen → 12-40 avis
 * - ~40% = longue traîne → 1-9 avis
 * - ~20% = aucun avis
 * 
 * Usage: npx tsx scripts/seed-reviews.ts
 */

import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// PARAMÈTRES CONFIGURABLES
// ──────────────────────────────────────────────────────────────────────────────

const REVIEW_DISTRIBUTION = {
  hits: { percent: 0.10, minReviews: 60, maxReviews: 200 },
  medium: { percent: 0.30, minReviews: 12, maxReviews: 40 },
  longTail: { percent: 0.40, minReviews: 1, maxReviews: 9 },
  noReviews: { percent: 0.20, minReviews: 0, maxReviews: 0 },
};

const RATING_DISTRIBUTION = [
  { rating: 5, probability: 0.55 },
  { rating: 4, probability: 0.28 },
  { rating: 3, probability: 0.12 },
  { rating: 2, probability: 0.03 },
  { rating: 1, probability: 0.02 },
];

const POSITIVE_REVIEWS = [
  "Excellent prompt, exactement ce qu'il me fallait !",
  "Très bien pensé, gain de temps énorme.",
  "Super résultats, je recommande vivement.",
  "Simple et efficace, bravo !",
  "Qualité professionnelle, je suis impressionné.",
  "Parfait pour mon workflow quotidien.",
  "Le meilleur prompt de cette catégorie.",
  "Résultats au-delà de mes attentes !",
  "Facile à utiliser et très performant.",
  "Excellent rapport qualité-prix.",
  "Ce prompt m'a fait gagner des heures de travail.",
  "Très bon prompt, le créateur est réactif.",
  "J'utilise ce prompt tous les jours maintenant.",
  "Vraiment bien conçu, chapeau !",
  "Superbe découverte, je l'ai partagé à mon équipe.",
];

const NEUTRAL_REVIEWS = [
  "Correct, fait le job.",
  "Pas mal mais pourrait être amélioré.",
  "Bon début, quelques ajustements nécessaires.",
  "Résultat satisfaisant dans l'ensemble.",
  "Fonctionne comme décrit.",
  "Bien mais manque de documentation.",
  "OK pour le prix.",
  "Assez bon, quelques limites.",
];

const NEGATIVE_REVIEWS = [
  "Déçu, ne correspond pas à la description.",
  "Résultats inconsistants.",
  "Trop basique pour le prix demandé.",
  "Ne fonctionne pas bien avec mon cas d'usage.",
  "Attendait mieux honnêtement.",
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRating(): number {
  const rand = Math.random();
  let cumulative = 0;
  for (const { rating, probability } of RATING_DISTRIBUTION) {
    cumulative += probability;
    if (rand <= cumulative) return rating;
  }
  return 5;
}

function pickReviewText(rating: number): string | null {
  if (Math.random() < 0.15) return null;
  if (rating >= 4) return randomItem(POSITIVE_REVIEWS);
  if (rating === 3) return randomItem(NEUTRAL_REVIEWS);
  return randomItem(NEGATIVE_REVIEWS);
}

function randomDateAfter(baseDate: string, maxDaysAfter: number): string {
  const base = new Date(baseDate).getTime();
  const offset = Math.random() * maxDaysAfter * 24 * 60 * 60 * 1000;
  return new Date(base + offset).toISOString();
}

interface ListingInfo {
  id: string;
  created_at: string;
  title: string;
}

interface SeedUser {
  id: string;
  reviewsLeft: number;
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
    console.error("❌ Refus de seed en production sans ALLOW_SEED=true");
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Erreur: SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log("📋 Récupération des listings et utilisateurs seed...\n");

  const { data: listings } = await supabase
    .from("listings")
    .select("id, created_at, title")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (!listings || listings.length === 0) {
    console.error("Aucun listing publié trouvé.");
    process.exit(1);
  }

  const { data: seedUsers } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_seed", true);

  if (!seedUsers || seedUsers.length < 100) {
    console.error("Pas assez d'utilisateurs seed. Lancez seed-users.ts d'abord.");
    process.exit(1);
  }

  console.log(`${listings.length} listings publiés`);
  console.log(`${seedUsers.length} utilisateurs seed disponibles\n`);

  const users: SeedUser[] = seedUsers.map((u) => ({
    id: u.id,
    reviewsLeft: Math.random() < 0.6 ? randomInt(1, 3) : randomInt(0, 30),
  }));

  const shuffledListings = [...listings].sort(() => Math.random() - 0.5);
  const totalListings = shuffledListings.length;

  const hitsCount = Math.floor(totalListings * REVIEW_DISTRIBUTION.hits.percent);
  const mediumCount = Math.floor(totalListings * REVIEW_DISTRIBUTION.medium.percent);
  const longTailCount = Math.floor(totalListings * REVIEW_DISTRIBUTION.longTail.percent);

  const categories = [
    { listings: shuffledListings.slice(0, hitsCount), tier: REVIEW_DISTRIBUTION.hits },
    { listings: shuffledListings.slice(hitsCount, hitsCount + mediumCount), tier: REVIEW_DISTRIBUTION.medium },
    { listings: shuffledListings.slice(hitsCount + mediumCount, hitsCount + mediumCount + longTailCount), tier: REVIEW_DISTRIBUTION.longTail },
  ];

  let totalReviews = 0;
  const reviewsToInsert: Array<{
    user_id: string;
    listing_id: string;
    rating: number;
    comment: string | null;
    is_seed: boolean;
    created_at: string;
  }> = [];

  for (const { listings: tierListings, tier } of categories) {
    for (const listing of tierListings) {
      const reviewCount = randomInt(tier.minReviews, tier.maxReviews);
      if (reviewCount === 0) continue;

      const availableUsers = users.filter((u) => u.reviewsLeft > 0);
      if (availableUsers.length === 0) break;

      const usersForThisListing = availableUsers
        .sort(() => Math.random() - 0.5)
        .slice(0, reviewCount);

      for (const user of usersForThisListing) {
        if (user.reviewsLeft <= 0) continue;

        const rating = pickRating();
        const comment = pickReviewText(rating);
        const createdAt = randomDateAfter(listing.created_at, 180);

        reviewsToInsert.push({
          user_id: user.id,
          listing_id: listing.id,
          rating,
          comment,
          is_seed: true,
          created_at: createdAt,
        });

        user.reviewsLeft--;
        totalReviews++;
      }
    }
  }

  console.log(`📝 Insertion de ${totalReviews} avis...\n`);

  const batchSize = 500;
  for (let i = 0; i < reviewsToInsert.length; i += batchSize) {
    const batch = reviewsToInsert.slice(i, i + batchSize);
    const { error } = await supabase.from("reviews").insert(batch);
    if (error) {
      console.warn(`  ⚠️ Erreur batch ${i}:`, error.message);
    } else {
      console.log(`  ${Math.min(i + batchSize, reviewsToInsert.length)}/${reviewsToInsert.length} avis insérés`);
    }
  }

  console.log("\n📊 Mise à jour des statistiques...\n");

  const { data: listingsWithReviews } = await supabase
    .from("reviews")
    .select("listing_id")
    .eq("is_seed", true);

  const listingIds = Array.from(new Set(listingsWithReviews?.map((r) => r.listing_id) ?? []));

  for (const listingId of listingIds) {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("rating")
      .eq("listing_id", listingId);

    if (reviews && reviews.length > 0) {
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

      await supabase
        .from("listing_stats")
        .upsert({
          listing_id: listingId,
          review_count: reviews.length,
          avg_rating: Math.round(avgRating * 10) / 10,
        }, { onConflict: "listing_id" });
    }
  }

  console.log("--- Résumé ---");
  console.log(`Avis créés: ${totalReviews}`);
  console.log(`Listings mis à jour: ${listingIds.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
