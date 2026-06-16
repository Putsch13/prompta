/** @type {import('next').NextConfig} */
const nextConfig = {
  // Active instrumentation.ts (init Sentry côté serveur quand SENTRY_DSN est défini).
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
