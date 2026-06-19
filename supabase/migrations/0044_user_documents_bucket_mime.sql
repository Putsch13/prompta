-- ============================================================
-- 0044 — Bucket user-documents : autoriser tous les types de fichiers
-- ============================================================
-- Le RAG doit accepter Excel, PowerPoint, Word, PDF, OpenDocument, etc.
-- Si le bucket a été créé via l'UI Supabase avec une liste `allowed_mime_types`
-- restreinte, le Storage rejette ces fichiers AVANT le code applicatif.
-- On lève la restriction (validation faite côté app dans uploadUserDocument)
-- et on aligne la taille max sur MAX_DOC_BYTES (10 Mo).
-- ============================================================

update storage.buckets
set
  allowed_mime_types = null,        -- null = tous les types autorisés
  file_size_limit = 10485760        -- 10 Mo
where id = 'user-documents';
