"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  orgSlug: string;
  isEditor: boolean;
}

export function OrgImportPanel({ orgSlug, isEditor }: Props) {
  const [listingId, setListingId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isEditor) return null;

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/org/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, listingId: listingId.trim() }),
    });
    const data = await res.json();

    if (res.ok) {
      setMessage(
        data.orgListing?.status === "approved"
          ? "Importé et approuvé."
          : "Importé — en attente d'approbation admin."
      );
      setListingId("");
      window.location.reload();
    } else {
      setMessage(data.error ?? "Erreur");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleImport} className="mt-4 space-y-2">
      <label className="block text-xs font-medium text-ink-soft">
        ID de l&apos;agent à importer
      </label>
      <div className="flex gap-2">
        <input
          value={listingId}
          onChange={(e) => setListingId(e.target.value)}
          placeholder="uuid du listing"
          className="h-9 flex-1 rounded-lg border border-line bg-card px-3 text-sm"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importer"}
        </button>
      </div>
      {message && <p className="text-xs text-ink-soft">{message}</p>}
    </form>
  );
}
