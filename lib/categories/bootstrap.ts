import { createAdminClient } from "@/lib/supabase/admin";
import { BUILDER_CATEGORIES } from "@/lib/catalogs";

export type CategoryRow = { id: string; name: string; slug: string };

/** Charge les catégories ; seed automatique si la table est vide. */
export async function ensureCategories(): Promise<CategoryRow[]> {
  const sb = createAdminClient();
  const { data: existing } = await sb
    .from("categories")
    .select("id, name, slug")
    .order("name");

  if (existing && existing.length > 0) {
    return existing;
  }

  const rows = BUILDER_CATEGORIES.map((c) => ({
    slug: c.slug,
    name: c.name,
    icon: c.icon ?? null,
  }));

  const { data: inserted, error } = await sb
    .from("categories")
    .upsert(rows, { onConflict: "slug" })
    .select("id, name, slug");

  if (error) {
    console.error("[categories] seed failed:", error.message);
    return [];
  }

  return inserted ?? [];
}
