import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import { PromptCard } from "@/components/PromptCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explorer les prompts, agents et workflows | Prompta",
  description:
    "Parcourez notre catalogue de prompts, agents et workflows IA par catégorie, type ou mot-clé.",
};

const TYPES = [
  { value: "", label: "Tous" },
  { value: "prompt", label: "Prompts" },
  { value: "agent", label: "Agents" },
  { value: "workflow", label: "Workflows" },
];

const PRICE_FILTERS = [
  { value: "", label: "Tous prix" },
  { value: "free", label: "Gratuit" },
  { value: "paid", label: "Payant" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Plus récent" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
];

interface Props {
  searchParams: {
    q?: string;
    type?: string;
    price?: string;
    category?: string;
    sort?: string;
    page?: string;
  };
}

const PAGE_SIZE = 12;

export default async function ExplorePage({ searchParams }: Props) {
  const supabase = createClient();
  const q = searchParams.q || "";
  const typeFilter = searchParams.type || "";
  const priceFilter = searchParams.price || "";
  const categoryFilter = searchParams.category || "";
  const sort = searchParams.sort || "recent";
  const page = parseInt(searchParams.page || "1");
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("listings")
    .select(
      "id, title, slug, type, description, price_cents, currency, tags, models, created_at, creator_id",
      { count: "exact" }
    )
    .eq("status", "published");

  if (q) {
    query = query.textSearch("search_vector", q, {
      type: "websearch",
      config: "french",
    });
  }

  if (typeFilter && ["prompt", "agent", "workflow"].includes(typeFilter)) {
    query = query.eq("type", typeFilter as "prompt" | "agent" | "workflow");
  }

  if (priceFilter === "free") {
    query = query.eq("price_cents", 0);
  } else if (priceFilter === "paid") {
    query = query.gt("price_cents", 0);
  }

  if (categoryFilter) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", categoryFilter)
      .single();
    if (cat) {
      query = query.eq("category_id", cat.id);
    }
  }

  if (sort === "price_asc") {
    query = query.order("price_cents", { ascending: true });
  } else if (sort === "price_desc") {
    query = query.order("price_cents", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data: listings, count } = await query;
  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  const listingIds = (listings || []).map((l) => l.id);

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

  const creatorIds = Array.from(new Set((listings || []).map((l) => l.creator_id)));
  const { data: creators } =
    creatorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", creatorIds)
      : { data: [] };

  const creatorsMap = new Map(
    (creators || []).map((c) => [c.id, c])
  );

  const reviewsByListing = new Map<string, { sum: number; count: number }>();
  (reviews || []).forEach((r) => {
    const existing = reviewsByListing.get(r.listing_id) || { sum: 0, count: 0 };
    existing.sum += r.rating;
    existing.count += 1;
    reviewsByListing.set(r.listing_id, existing);
  });

  const downloadsByListing = new Map<string, number>();
  (downloads || []).forEach((d) => {
    downloadsByListing.set(d.listing_id, (downloadsByListing.get(d.listing_id) || 0) + 1);
  });

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, name")
    .order("name");

  function buildUrl(params: Record<string, string>) {
    const sp = new URLSearchParams();
    const merged = {
      q,
      type: typeFilter,
      price: priceFilter,
      category: categoryFilter,
      sort,
      ...params,
    };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    return `/explore?${sp.toString()}`;
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-page px-4 py-10 sm:px-6 lg:px-8">
        <form action="/explore" method="get" className="relative mx-auto max-w-2xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Rechercher un prompt, agent, workflow…"
            className="h-14 w-full rounded-xl border border-line bg-card pl-12 pr-4 text-base text-ink shadow-sm outline-none placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </form>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {TYPES.map((t) => (
            <Link
              key={t.value}
              href={buildUrl({ type: t.value, page: "1" })}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === t.value
                  ? "bg-accent text-white"
                  : "border border-line text-ink hover:border-accent"
              }`}
            >
              {t.label}
            </Link>
          ))}

          <span className="mx-2 h-6 w-px bg-line" />

          {PRICE_FILTERS.map((p) => (
            <Link
              key={p.value}
              href={buildUrl({ price: p.value, page: "1" })}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                priceFilter === p.value
                  ? "bg-accent text-white"
                  : "border border-line text-ink hover:border-accent"
              }`}
            >
              {p.label}
            </Link>
          ))}

          {categories && categories.length > 0 && (
            <>
              <span className="mx-2 h-6 w-px bg-line" />
              <select
                defaultValue={categoryFilter}
                className="rounded-full border border-line bg-card px-4 py-1.5 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="">Toutes catégories</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-ink-soft">Trier :</span>
            {SORT_OPTIONS.map((s) => (
              <Link
                key={s.value}
                href={buildUrl({ sort: s.value, page: "1" })}
                className={`text-sm font-medium transition-colors ${
                  sort === s.value ? "text-accent" : "text-ink-soft hover:text-ink"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <p className="text-sm text-ink-soft">
            {count || 0} résultat{(count || 0) > 1 ? "s" : ""}
            {q && <> pour &quot;{q}&quot;</>}
          </p>

          {!listings || listings.length === 0 ? (
            <div className="mt-12 text-center">
              <p className="text-lg text-ink-soft">Aucun résultat trouvé.</p>
              <p className="mt-2 text-sm text-ink-faint">
                Essaie de modifier tes filtres ou ta recherche.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((listing) => {
                const reviewData = reviewsByListing.get(listing.id);
                const avgRating = reviewData
                  ? reviewData.sum / reviewData.count
                  : null;
                const reviewCount = reviewData?.count || 0;
                const downloadCount = downloadsByListing.get(listing.id) || 0;
                const creator = creatorsMap.get(listing.creator_id);

                return (
                  <PromptCard
                    key={listing.id}
                    slug={listing.slug}
                    title={listing.title}
                    type={listing.type as "prompt" | "agent" | "workflow"}
                    priceCents={listing.price_cents}
                    description={listing.description}
                    rating={avgRating}
                    reviewCount={reviewCount}
                    downloads={downloadCount}
                    creator={
                      creator
                        ? {
                            username: creator.username,
                            display_name: creator.display_name,
                            avatar_url: creator.avatar_url,
                          }
                        : null
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={buildUrl({ page: String(page - 1) })}
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink hover:border-accent"
              >
                Précédent
              </Link>
            )}
            <span className="px-4 text-sm text-ink-soft">
              Page {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={buildUrl({ page: String(page + 1) })}
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink hover:border-accent"
              >
                Suivant
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
