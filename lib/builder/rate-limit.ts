import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { isUnrestrictedUser } from "@/lib/auth/privileges";

/**
 * Garde-fou commun aux routes builder/auto-fix (appels LLM coûteux).
 * Retourne une réponse 429 si la limite est atteinte, sinon `null` (continuer).
 * Les comptes non restreints (admin/owner) ne sont pas limités, comme pour les runs.
 */
export async function builderRateLimit(userId: string): Promise<Response | null> {
  if (await isUnrestrictedUser(userId)) return null;
  const rate = checkRateLimit(`builder:${userId}`, RATE_LIMITS.builder);
  if (!rate.success) return rateLimitResponse(rate.resetAt);
  return null;
}
