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
    // Marketplace dépubliée (recentrage produit sur l'assistant navigateur) :
    // les anciennes URL publiques — catalogue, catégories, profils créateurs —
    // redirigent vers l'accueil. Les pages /listing restent (lancement d'un
    // agent possédé/abonné) mais ne sont plus indexées.
    return [
      { source: "/explore", destination: "/", permanent: true },
      { source: "/c/:slug*", destination: "/", permanent: true },
      { source: "/u/:username*", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
