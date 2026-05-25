"use client";

import { useState } from "react";
import { Loader2, Repeat } from "lucide-react";

interface Props {
  listingId: string;
  priceCents: number;
  alreadySubscribed?: boolean;
  creatorKycComplete?: boolean;
}

export function SubscribeButton({
  listingId,
  priceCents,
  alreadySubscribed = false,
  creatorKycComplete = true,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    const res = await fetch("/api/stripe/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || data.message || "Erreur");
      setLoading(false);
    }
  }

  if (alreadySubscribed) {
    return (
      <p className="mt-3 text-center text-sm text-green-600">
        Abonnement actif — lancez avec vos clés API
      </p>
    );
  }

  if (!creatorKycComplete) {
    return (
      <p className="mt-3 text-center text-xs text-ink-soft">
        Abonnement indisponible — créateur en cours de vérification Stripe
      </p>
    );
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Repeat className="h-4 w-4" />
          S&apos;abonner — {(priceCents / 100).toFixed(2)} €/mois
        </>
      )}
    </button>
  );
}
