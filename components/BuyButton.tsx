"use client";

import { useState } from "react";
import { Loader2, Download, ShoppingCart, Play } from "lucide-react";
import Link from "next/link";

interface Props {
  listingId: string;
  versionId: string | null;
  listingSlug?: string;
  listingType?: "prompt" | "agent" | "workflow";
  priceCents: number;
  isFree: boolean;
  alreadyPurchased: boolean;
  isOwner: boolean;
  creatorKycComplete?: boolean;
}

const RUNNABLE_TYPES = new Set(["agent", "workflow"]);

export function BuyButton({
  listingId,
  versionId,
  listingSlug,
  listingType = "prompt",
  priceCents,
  isFree,
  alreadyPurchased,
  isOwner,
  creatorKycComplete = true,
}: Props) {
  const [loading, setLoading] = useState(false);
  const canDownload = listingType === "prompt";

  async function handleBuy() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return; // redirection en cours : le spinner reste affiché
      }
      alert(data.error || "Erreur");
    } catch {
      alert("Erreur réseau — réessayez.");
    }
    setLoading(false);
  }

  async function handleDownload() {
    if (!versionId || !canDownload) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/download/${versionId}`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        alert(data.error || "Erreur");
      }
    } catch {
      alert("Erreur réseau — réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (RUNNABLE_TYPES.has(listingType) && (isFree || alreadyPurchased || isOwner)) {
    const href = listingSlug ? `/listing/${listingSlug}` : `/listing/${listingId}`;
    return (
      <Link
        href={href}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover"
      >
        <Play className="h-4 w-4" />
        Lancer l&apos;agent
      </Link>
    );
  }

  if (isOwner && canDownload) {
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

  if ((isFree || alreadyPurchased) && canDownload) {
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
