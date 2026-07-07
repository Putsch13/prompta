import type { MetadataRoute } from "next";
import { USE_CASE_SLUGS } from "@/lib/marketing/use-cases";

export const dynamic = "force-dynamic";

/**
 * Sitemap — pages MARKETING uniquement. Les agents, profils et catégories
 * sont privés (plus de marketplace) : rien à indexer côté Google.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const now = new Date();

  return [
    { url: baseUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/aide`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/cas-usage`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...USE_CASE_SLUGS.map((slug) => ({
      url: `${baseUrl}/cas-usage/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: `${baseUrl}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
