import { createAdminClient } from "@/lib/supabase/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

const INLINE_MAX_BYTES = 256 * 1024; // 256 KB — au-delà on stocke dans Storage

export interface SaveDeliverableParams {
  runId: string;
  listingId: string;
  userId: string;
  kind: string;
  filename: string;
  mimeType: string;
  content: string;
  previewText?: string;
}

/**
 * Sauvegarde un livrable produit par l'agent.
 * Si le contenu dépasse INLINE_MAX_BYTES, il est uploadé dans Supabase Storage.
 * Retourne l'id du deliverable créé.
 */
export async function saveDeliverable(params: SaveDeliverableParams): Promise<string> {
  const admin = createAdminClient();
  const sizeBytes = Buffer.byteLength(params.content, "utf-8");
  const preview = params.previewText ?? params.content.slice(0, 500);

  let storagePath: string | null = null;
  let contentText: string | null = params.content;

  if (sizeBytes > INLINE_MAX_BYTES) {
    const path = `deliverables/${params.userId}/${params.runId}/${params.filename}`;
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

  const { data, error } = await (admin as any)
    .from("agent_deliverables")
    .insert({
      run_id: params.runId,
      listing_id: params.listingId,
      user_id: params.userId,
      kind: params.kind,
      filename: params.filename,
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
