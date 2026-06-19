import { createAdminClient } from "@/lib/supabase/admin";

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
  // Word
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  // Excel
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  // PowerPoint
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  // OpenDocument
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
]);

/** Extensions acceptées (filet quand le mime-type est absent/générique). */
const ALLOWED_EXT = new Set([
  "txt", "csv", "md", "json", "pdf",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "odt", "ods", "odp",
]);

function fileExt(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

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
  const typeOk =
    (file.type && (ALLOWED_MIME.has(file.type) || file.type.startsWith("text/"))) ||
    ALLOWED_EXT.has(fileExt(file.name));
  if (!typeOk) {
    throw new Error(
      "Type de fichier non supporté. Formats acceptés : PDF, Word (.doc/.docx), " +
        "Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), OpenDocument, TXT, CSV, MD, JSON.",
    );
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
  const ext = fileExt(doc.name);
  const mime = doc.mime_type ?? "";

  // Formats texte → lecture directe.
  const isTextLike =
    mime.startsWith("text/") ||
    mime === "application/json" ||
    ["txt", "csv", "md", "json"].includes(ext);
  if (isTextLike) {
    return buf.toString("utf-8").slice(0, 200_000);
  }

  // Tableurs (Excel/ODS) → SheetJS, bien plus tolérant qu'officeparser
  // (gère .xls binaire legacy, .xlsx, .ods, exports Google).
  const isSpreadsheet =
    ["xls", "xlsx", "xlsm", "xlsb", "ods"].includes(ext) ||
    mime.includes("spreadsheet") ||
    mime.includes("ms-excel");
  if (isSpreadsheet) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "buffer" });
      const parts: string[] = [];
      for (const name of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        if (csv.trim()) parts.push(`# Feuille : ${name}\n${csv}`);
      }
      const text = parts.join("\n\n").trim();
      if (text) return text.slice(0, 200_000);
      return `[Classeur « ${doc.name} » : aucune donnée lisible.]`;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("[documents] extraction Excel échouée", { name: doc.name, mime, reason });
      throw new Error(`Impossible de lire le classeur « ${doc.name} » : ${reason.slice(0, 200)}`);
    }
  }

  // Autres formats binaires (PDF, Word, PowerPoint, OpenDocument) → officeparser.
  try {
    const { parseOffice } = await import("officeparser");
    const ast = await parseOffice(buf);
    const text = ast.toText().trim();
    if (text) return text.slice(0, 200_000);
    return `[Document « ${doc.name} » : aucun texte extractible (peut-être un scan/image).]`;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[documents] extraction échouée", { name: doc.name, mime, reason });
    throw new Error(
      `Impossible d'extraire le texte de « ${doc.name} » : ${reason.slice(0, 200)}`,
    );
  }
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
