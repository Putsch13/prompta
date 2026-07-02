import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const INLINE_MAX_BYTES = 256 * 1024; // 256 KB — au-delà on stocke dans Storage
export const DELIVERABLE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB plafond global

export interface SaveDeliverableParams {
  runId: string;
  /** Null pour un run de test builder (pas de listing publié). */
  listingId: string | null;
  userId: string;
  kind: string;
  filename: string;
  mimeType: string;
  content: string;
  previewText?: string;
}

/** Nettoie un nom de fichier pour éviter path traversal et caractères dangereux. */
export function sanitizeDeliverableFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "deliverable.txt";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  const trimmed = cleaned.replace(/^[._-]+/, "").slice(0, 180);
  return trimmed.length > 0 ? trimmed : "deliverable.txt";
}

/**
 * Sauvegarde un livrable produit par l'agent.
 * Si le contenu dépasse INLINE_MAX_BYTES, il est uploadé dans Supabase Storage.
 * Retourne l'id du deliverable créé.
 */
export async function saveDeliverable(params: SaveDeliverableParams): Promise<string> {
  const admin = createAdminClient();
  const sizeBytes = Buffer.byteLength(params.content, "utf-8");

  if (sizeBytes > DELIVERABLE_MAX_BYTES) {
    throw new Error(
      `Livrable trop volumineux (${Math.round(sizeBytes / 1024)} Ko, max ${DELIVERABLE_MAX_BYTES / 1024 / 1024} Mo)`,
    );
  }

  const filename = sanitizeDeliverableFilename(params.filename);
  const preview = params.previewText ?? params.content.slice(0, 500);

  let storagePath: string | null = null;
  let contentText: string | null = params.content;

  if (sizeBytes > INLINE_MAX_BYTES) {
    const path = `deliverables/${params.userId}/${params.runId}/${filename}`;
    const { error: uploadError } = await admin.storage
      .from("agent-deliverables")
      .upload(path, Buffer.from(params.content, "utf-8"), {
        contentType: params.mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload Storage échoué: ${uploadError.message}`);
    }

    storagePath = path;
    contentText = null;
  }

  const { data, error } = await admin
    .from("agent_deliverables")
    .insert({
      run_id: params.runId,
      // "" (run de test worker, listing absent) → null, sinon uuid invalide et
      // le livrable disparaissait en silence.
      listing_id: params.listingId || null,
      user_id: params.userId,
      kind: params.kind,
      filename,
      mime_type: params.mimeType,
      storage_path: storagePath,
      content_text: contentText,
      preview_text: preview,
      size_bytes: sizeBytes,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Insertion deliverable échouée: ${error.message}`);
  }

  return data.id as string;
}
