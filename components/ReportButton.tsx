"use client";

import { useState } from "react";
import { Flag, Loader2, CheckCircle } from "lucide-react";

interface Props {
  listingId: string;
}

export function ReportButton({ listingId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) return;
    setLoading(true);

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    await supabase.from("moderation_flags").insert({
      listing_id: listingId,
      reason,
    });

    setLoading(false);
    setDone(true);
    setTimeout(() => { setOpen(false); setDone(false); setReason(""); }, 2000);
  }

  if (done) {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <CheckCircle className="h-3.5 w-3.5" /> Signalement envoyé
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-muted hover:text-destructive transition-colors"
      >
        <Flag className="h-3.5 w-3.5" />
        Signaler
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium">Pourquoi signaler ce contenu ?</p>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-2 w-full rounded border border-border px-2 py-1 text-xs outline-none focus:border-accent resize-none"
        placeholder="Contenu inapproprié, spam, plagiat..."
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading || !reason.trim()}
          className="rounded bg-destructive px-3 py-1 text-xs text-white hover:bg-destructive/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Envoyer"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded border border-border px-3 py-1 text-xs hover:bg-gray-50"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
