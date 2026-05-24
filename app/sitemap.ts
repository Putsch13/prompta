import { createAdminClient } from "@/lib/supabase/admin";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const supabase = createAdminClient();

  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/explore`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
  ];

  const { data: listings } = await supabase
    .from("listings")
    .select("slug, updated_at")
    .eq("status", "published");

  if (listings) {
    for (const l of listings) {
      entries.push({
        url: `${baseUrl}/listing/${l.slug}`,
        lastModified: new Date(l.updated_at),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("username, created_at");

  if (profiles) {
    for (const p of profiles) {
      entries.push({
        url: `${baseUrl}/u/${p.username}`,
        lastModified: new Date(p.created_at),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("slug");

  if (categories) {
    for (const c of categories) {
      entries.push({
        url: `${baseUrl}/c/${c.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  return entries;
}
