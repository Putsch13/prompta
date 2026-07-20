/** @type {import('next').NextConfig} */
const nextConfig = {
  // instrumentation.ts est activé par défaut depuis Next 15 (init Sentry serveur).
  async headers() {
    // Interdiction d'iframe sur toutes les surfaces authentifiées et sensibles :
    // /quick (contexte par postMessage) ET tout /dashboard — la page de
    // validation humaine (/dashboard/validations) est le garde-fou qui autorise
    // les écritures ; un clic volé par clickjacking le contournerait.
    const antiFrame = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ];
    return [
      { source: "/quick", headers: antiFrame },
      { source: "/dashboard/:path*", headers: antiFrame },
    ];
  },
  async redirects() {
    // Recentrage produit : marketplace, builder, orgs et cas d'usage hors produit.
    return [
      { source: "/explore", destination: "/", permanent: true },
      { source: "/c/:slug*", destination: "/", permanent: true },
      { source: "/u/:username*", destination: "/", permanent: true },
      // /cas-usage est REVENU comme surface SEO (longue traîne) — ne pas rediriger.
      { source: "/org/:slug*", destination: "/", permanent: true },
      { source: "/listing/:slug*", destination: "/", permanent: true },
      { source: "/dashboard/new", destination: "/dashboard/runs", permanent: true },
      { source: "/dashboard/contenus", destination: "/dashboard/runs", permanent: true },
      { source: "/dashboard/ia-quotidien", destination: "/dashboard/runs", permanent: true },
      { source: "/dashboard/documents", destination: "/dashboard/runs", permanent: true },
      { source: "/dashboard/payouts", destination: "/dashboard/runs", permanent: true },
      {
        source: "/dashboard/listing/:id/edit",
        destination: "/dashboard/runs",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
