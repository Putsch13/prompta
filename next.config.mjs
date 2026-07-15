/** @type {import('next').NextConfig} */
const nextConfig = {
  // instrumentation.ts est activé par défaut depuis Next 15 (init Sentry serveur).
  async headers() {
    return [
      {
        // /quick reçoit le contexte de page par postMessage : interdire son
        // embarquement en iframe ferme le vecteur clickjacking / injection.
        source: "/quick",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
