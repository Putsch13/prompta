import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Surfaces coupées ou privées : pas d'indexation.
        disallow: ["/dashboard/", "/api/", "/auth/", "/u/", "/c/", "/org/", "/quick"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
