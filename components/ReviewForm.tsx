"use client";

import { useState } from "react";
import { Star, Loader2, Send } from "lucide-react";

interface Props {
  listingId: string;
  canReview: boolean;
}

export function ReviewForm({ listingId, canReview }: Props) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canReview) return null;
  if (submitted) {
    return (
      <p className="mt-4 rounded-lg bg-success/10 p-3 text-sm text-success">
        Merci pour ton avis !
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    setLoading(true);
    setError(null);

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { error: insertError } = await supabase.from("reviews").insert({
      listing_id: listingId,
      author_id: user.id,
      rating,
      body: body || null,
    });

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSubmitted(true);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold">Laisser un avis</h3>

      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onMouseEnter={() => setHoverRating(v)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(v)}
          >
            <Star
              className={`h-6 w-6 transition-colors ${
                v <= (hoverRating || rating)
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-200"
              }`}
            />
          </button>
        ))}
      </div>

      <textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Ton retour (optionnel)..."
        className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-accent resize-none"
      />

      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || rating === 0}
        className="mt-3 flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Publier
      </button>
    </form>
  );
}
