/**
 * Hook d'instrumentation Next.js — exécuté une fois au démarrage du serveur.
 * Initialise Sentry côté serveur/edge quand SENTRY_DSN est défini (sinon no-op).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const { ensureSentry } = await import("@/lib/observability");
    await ensureSentry();
  }
}
