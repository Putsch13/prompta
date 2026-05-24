"use client";

import { useState } from "react";
import { Loader2, Download, ShoppingCart } from "lucide-react";

interface Props {
  listingId: string;
  versionId: string | null;
  priceCents: number;
  isFree: boolean;
  alreadyPurchased: boolean;
  isOwner: boolean;
  creatorKycComplete?: boolean;
}

export function BuyButton({
  listingId,
  versionId,
  priceCents,
  isFree,
  alreadyPurchased,
  isOwner,
  creatorKycComplete = true,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleBuy() {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Erreur");
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!versionId) return;
    setLoading(true);
    const res = await fetch(`/api/download/${versionId}`);
    const data = await res.json();
    if (data.url) {
      window.open(data.url, "_blank");
    } else {
      alert(data.error || "Erreur");
    }
    setLoading(false);
  }

  if (isOwner) {
    return (
      <button
        onClick={handleDownload}
        disabled={loading || !versionId}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium transition-colors hover:bg-accent-light disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Télécharger mon bundle
      </button>
    );
  }

  if (isFree || alreadyPurchased) {
    return (
      <button
        onClick={handleDownload}
        disabled={loading || !versionId}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {alreadyPurchased ? "Télécharger" : "Télécharger gratuitement"}
      </button>
    );
  }

  if (!creatorKycComplete) {
    return (
      <div className="mt-4">
        <button
          disabled
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink-faint text-sm font-medium text-ink-soft cursor-not-allowed"
        >
          <ShoppingCart className="h-4 w-4" />
          Acheter — {(priceCents / 100).toFixed(2)} €
        </button>
        <p className="mt-2 text-center text-xs text-ink-soft">
          Ce créateur n&apos;a pas encore complété sa vérification. L&apos;achat sera disponible prochainement.
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={handleBuy}
      disabled={loading}
      className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <ShoppingCart className="h-4 w-4" />
          Acheter — {(priceCents / 100).toFixed(2)} €
        </>
      )}
    </button>
  );
}
