import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface UserDocument {
  id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number;
  tags: string[];
  created_at: string;
}

const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 Mo
const ALLOWED_MIME = new Set([
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/pdf",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

export async function listUserDocuments(userId: string): Promise<UserDocument[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_documents")
    .select("id, name, mime_type, size_bytes, tags, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as UserDocument[];
}

export async function uploadUserDocument(
  userId: string,
  file: File
): Promise<UserDocument> {
  if (file.size > MAX_DOC_BYTES) {
    throw new Error("Fichier trop volumineux (max 10 Mo).");
  }
  if (file.type && !ALLOWED_MIME.has(file.type) && !file.type.startsWith("text/")) {
    throw new Error("Type de fichier non supporté (PDF, TXT, CSV, MD, JSON, DOCX).");
  }

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() ?? "bin";
  const docId = crypto.randomUUID();
  const path = `${userId}/${docId}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("user-documents")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await admin
    .from("user_documents")
    .insert({
      id: docId,
      user_id: userId,
      name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select("id, name, mime_type, size_bytes, tags, created_at")
    .single();

  if (error) throw new Error(error.message);
  return data as UserDocument;
}

export async function deleteUserDocument(userId: string, documentId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("user_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!doc) throw new Error("Document introuvable");

  await admin.storage.from("user-documents").remove([doc.storage_path]);
  await admin.from("user_documents").delete().eq("id", documentId).eq("user_id", userId);
}

/** Charge le texte d'un document pour un agent (retrieve / variable file). */
export async function getDocumentText(userId: string, documentId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("user_documents")
    .select("storage_path, mime_type, name")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!doc) throw new Error("Document introuvable ou accès refusé");

  const { data: blob, error } = await admin.storage.from("user-documents").download(doc.storage_path);
  if (error || !blob) throw new Error("Impossible de lire le document");

  const buf = Buffer.from(await blob.arrayBuffer());

  if (doc.mime_type === "application/pdf") {
    return `[Document PDF: ${doc.name} — ${buf.length} octets. Extraction texte PDF à brancher si besoin.]`;
  }

  return buf.toString("utf-8").slice(0, 120_000);
}

/** Résout document_id / {{document}} depuis les inputs agent. */
export async function resolveDocumentFromInputs(
  userId: string,
  inputs: Record<string, string>
): Promise<string | null> {
  const docId =
    inputs.document_id ||
    inputs.documentId ||
    inputs.user_document_id ||
    inputs.file_id;

  if (!docId) return null;
  return getDocumentText(userId, docId);
}
