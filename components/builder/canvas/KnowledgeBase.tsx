"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, ClipboardCopy, Loader2, Upload } from "lucide-react";

interface UserDoc {
  id: string;
  name: string;
}

/**
 * Bloc « Base de connaissances » (RAG) — P1-2.
 * Permet d'uploader des fichiers pour enrichir le savoir de l'agent. Les IDs
 * documents servent dans une étape retrieve (source file_upload). On peut
 * copier l'ID pour le coller dans la réponse au copilote.
 */
export function KnowledgeBase() {
  const [docs, setDocs] = useState<UserDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/documents");
      if (res.ok) {
        const d = await res.json();
        setDocs(d.documents ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/account/documents", { method: "POST", body: fd });
      if (res.ok) await load();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function copyId(id: string) {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-sm font-medium text-ink"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-accent" />
          Base de connaissances (RAG)
          {docs.length > 0 && (
            <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px]">{docs.length}</span>
          )}
        </span>
        <span className="text-xs text-ink-faint">{open ? "Masquer" : "Afficher"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink-soft">
            Uploadez des fichiers pour enrichir le savoir de l&apos;agent. Copiez l&apos;ID d&apos;un
            document et collez-le quand le copilote vous le demande.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Ajouter un fichier
          </button>
          <input
            ref={inputRef}
            type="file"
            onChange={onFile}
            className="hidden"
            accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp"
          />

          {docs.length > 0 && (
            <ul className="space-y-1">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-card2 px-2.5 py-1.5"
                >
                  <span className="min-w-0 truncate text-xs text-ink">{d.name}</span>
                  <button
                    type="button"
                    onClick={() => copyId(d.id)}
                    className="flex shrink-0 items-center gap-1 text-[11px] text-accent hover:underline"
                  >
                    {copiedId === d.id ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <ClipboardCopy className="h-3 w-3" />
                    )}
                    {copiedId === d.id ? "ID copié" : "Copier l'ID"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
