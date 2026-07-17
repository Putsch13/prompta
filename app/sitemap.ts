import type { MetadataRoute } from "next";


/**
 * Sitemap — pages MARKETING uniquement. Plus de cas d'usage, marketplace,
 * profils ou listings à indexer.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const now = new Date();

  return [
    { url: baseUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/prompta-partout`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${baseUrl}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/aide`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
