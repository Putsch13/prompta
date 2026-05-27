import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Version à exécuter pour un utilisateur :
 * - propriétaire → current_version_id
 * - abonné actif → pinned_version_id (figée à la souscription)
 * - sinon → current_version_id (achat unique / gratuit)
 */
export async function resolveAgentVersionId(
  client: SupabaseClient,
  params: {
    listingId: string;
    userId: string;
    creatorId: string;
    currentVersionId: string | null;
  }
): Promise<string | null> {
  if (params.creatorId === params.userId) {
    return params.currentVersionId;
  }

  const { data: sub } = await client
    .from("subscriptions")
    .select("pinned_version_id, status")
    .eq("user_id", params.userId)
    .eq("listing_id", params.listingId)
    .eq("status", "active")
    .maybeSingle();

  if (sub?.pinned_version_id) {
    return sub.pinned_version_id as string;
  }

  return params.currentVersionId;
}

/** Vérifie qu'un versionId demandé est autorisé pour cet utilisateur. */
export async function assertAllowedAgentVersion(
  client: SupabaseClient,
  params: {
    listingId: string;
    userId: string;
    creatorId: string;
    currentVersionId: string | null;
    requestedVersionId: string;
  }
): Promise<{ ok: true; versionId: string } | { ok: false; error: string }> {
  const allowed = await resolveAgentVersionId(client, {
    listingId: params.listingId,
    userId: params.userId,
    creatorId: params.creatorId,
    currentVersionId: params.currentVersionId,
  });

  if (!allowed) {
    return { ok: false, error: "Aucune version disponible pour cet agent" };
  }

  if (params.requestedVersionId !== allowed) {
    return {
      ok: false,
      error: "Version agent non autorisée (abonnement figé sur une version antérieure)",
    };
  }

  return { ok: true, versionId: allowed };
}
