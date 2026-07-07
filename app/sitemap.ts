import type { MetadataRoute } from "next";

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
    { url: `${baseUrl}/cas-usage/veille-quotidienne`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/cas-usage/reporting-automatique`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/cas-usage/prospection-contenu`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
