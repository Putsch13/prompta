import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /listing, /u, /c : surfaces marketplace dépubliées (les /listing
        // restent servies aux possesseurs/abonnés mais ne s'indexent plus).
        disallow: ["/dashboard/", "/api/", "/auth/", "/listing/", "/u/", "/c/", "/quick", "/wallet"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
