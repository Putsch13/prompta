import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explorer les prompts, agents et workflows",
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
    query = query.textSearch("search_vector", q, { type: "websearch", config: "french" });
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

  const { data: categories } = await supabase
    .from("categories")
    .select("slug, name")
    .order("name");

  function buildUrl(params: Record<string, string>) {
    const sp = new URLSearchParams();
    const merged = { q, type: typeFilter, price: priceFilter, category: categoryFilter, sort, ...params };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    return `/explore?${sp.toString()}`;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Recherche */}
      <form action="/explore" method="get" className="relative mx-auto max-w-2xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Rechercher un prompt, agent, workflow…"
          className="h-14 w-full rounded-xl border border-border bg-card pl-12 pr-4 text-base shadow-sm outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>

      {/* Filtres */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {/* Type */}
        {TYPES.map((t) => (
          <Link
            key={t.value}
            href={buildUrl({ type: t.value, page: "1" })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              typeFilter === t.value
                ? "bg-accent text-white"
                : "border border-border hover:border-accent"
            }`}
          >
            {t.label}
          </Link>
        ))}

        <span className="mx-2 h-6 w-px bg-border" />

        {/* Prix */}
        {PRICE_FILTERS.map((p) => (
          <Link
            key={p.value}
            href={buildUrl({ price: p.value, page: "1" })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              priceFilter === p.value
                ? "bg-accent text-white"
                : "border border-border hover:border-accent"
            }`}
          >
            {p.label}
          </Link>
        ))}

        {/* Catégorie dropdown */}
        {categories && categories.length > 0 && (
          <>
            <span className="mx-2 h-6 w-px bg-border" />
            <select
              defaultValue={categoryFilter}
              className="rounded-full border border-border px-4 py-1.5 text-sm outline-none focus:border-accent"
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

        {/* Tri */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted">Trier :</span>
          {SORT_OPTIONS.map((s) => (
            <Link
              key={s.value}
              href={buildUrl({ sort: s.value, page: "1" })}
              className={`text-sm font-medium transition-colors ${
                sort === s.value ? "text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Résultats */}
      <div className="mt-8">
        <p className="text-sm text-muted">
          {count || 0} résultat{(count || 0) > 1 ? "s" : ""}
          {q && <> pour &quot;{q}&quot;</>}
        </p>

        {!listings || listings.length === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-lg text-muted">Aucun résultat trouvé.</p>
            <p className="mt-2 text-sm text-muted">
              Essaie de modifier tes filtres ou ta recherche.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <Link
                key={listing.id}
                href={`/listing/${listing.slug}`}
                className="group rounded-xl border border-border bg-card p-5 transition-all hover:border-accent hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <span className="inline-block rounded bg-accent-light px-2 py-0.5 text-xs font-medium text-accent">
                    {listing.type}
                  </span>
                  <span className="text-sm font-semibold">
                    {listing.price_cents === 0
                      ? "Gratuit"
                      : `${(listing.price_cents / 100).toFixed(2)} €`}
                  </span>
                </div>

                <h3 className="mt-3 font-semibold group-hover:text-accent transition-colors">
                  {listing.title}
                </h3>

                {listing.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted">
                    {listing.description}
                  </p>
                )}

                {listing.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {listing.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-muted"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {listing.models.length > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {listing.models.join(", ")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={buildUrl({ page: String(page - 1) })}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent"
            >
              Précédent
            </Link>
          )}
          <span className="px-4 text-sm text-muted">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={buildUrl({ page: String(page + 1) })}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:border-accent"
            >
              Suivant
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
