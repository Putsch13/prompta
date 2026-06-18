"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Upload, Trash2, FileText } from "lucide-react";
import type { UserDocument } from "@/lib/documents/user-documents";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/account/documents");
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/account/documents", { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(data.error ?? "Upload échoué");
      return;
    }
    setDocuments((prev) => [data.document, ...prev]);
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce document ?")) return;
    const res = await fetch(`/api/account/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-ink">Mes documents</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Déposez des fichiers (PDF, TXT, CSV, MD, JSON, DOCX) que vos agents pourront lire lors
        d&apos;un run — via un champ « document » ou une étape retrieve.
      </p>

      <div className="mt-6 rounded-xl border border-dashed border-line bg-card p-6 text-center">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.csv,.md,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,text/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Ajouter un document
        </button>
        <p className="mt-2 text-xs text-ink-faint">Max 10 Mo par fichier</p>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {documents.length === 0 ? (
          <li className="rounded-xl border border-line bg-card p-6 text-center text-sm text-ink-soft">
            Aucun document — uploadez un fichier pour le rendre disponible à vos agents.
          </li>
        ) : (
          documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{doc.name}</p>
                  <p className="text-xs text-ink-soft">
                    {formatSize(doc.size_bytes)} · ID :{" "}
                    <code className="rounded bg-card2 px-1 font-mono text-[10px]">{doc.id}</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                className="rounded-lg p-2 text-ink-soft hover:bg-destructive/10 hover:text-destructive"
                title="Supprimer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
