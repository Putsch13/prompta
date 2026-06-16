/**
 * Capture d'erreurs serveur — Sentry si configuré (SENTRY_DSN), sinon log.
 *
 * Volontairement minimal et sûr :
 * - init paresseuse + idempotente, gardée par SENTRY_DSN ;
 * - import dynamique dans try/catch → aucune erreur si Sentry indisponible ;
 * - fonctionne aussi bien côté Next (via instrumentation.ts) que dans le worker
 *   autonome (init au premier appel).
 * - pas de bundling client, pas d'upload de sourcemaps (aucun risque de build/CI).
 */

let initPromise: Promise<unknown> | null = null;
let sentryEnabled = false;

export async function ensureSentry(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  initPromise = (async () => {
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV ?? "development",
        tracesSampleRate: 0,
      });
      sentryEnabled = true;
    } catch (err) {
      console.error(
        "[observability] init Sentry échouée:",
        err instanceof Error ? err.message : err,
      );
    }
  })();
  await initPromise;
}

export async function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  // Toujours tracer en clair (utile même sans Sentry).
  console.error(
    "[error]",
    error instanceof Error ? error.message : error,
    context ?? {},
  );

  if (!process.env.SENTRY_DSN) return;
  try {
    await ensureSentry();
    if (!sentryEnabled) return;
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // capture best-effort — ne jamais faire échouer l'appelant.
  }
}
