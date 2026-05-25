"use client";

import { useState, useEffect } from "react";
import { Loader2, Coins } from "lucide-react";
import { CREDIT_PACKS } from "@/lib/credit-packs";

export default function CreditsPage() {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => setBalance(d.balanceCents ?? 0))
      .finally(() => setLoading(false));
  }, []);

  async function buyPack(packId: string) {
    setBuying(packId);
    const res = await fetch("/api/stripe/credits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setBuying(null);
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
      <h1 className="font-display text-2xl font-bold text-ink">Crédits plateforme</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Lancez des prompts sans clé API personnelle — débit à 0,10 € par run.
      </p>

      <div className="mt-8 rounded-xl border border-line bg-card p-6">
        <div className="flex items-center gap-3">
          <Coins className="h-8 w-8 text-accent" />
          <div>
            <p className="text-sm text-ink-soft">Solde disponible</p>
            <p className="font-display text-3xl font-bold text-ink">
              {(balance / 100).toFixed(2)} €
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <div
            key={pack.id}
            className="rounded-xl border border-line bg-card p-5 text-center"
          >
            <p className="font-display text-xl font-bold text-ink">{pack.label}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {(pack.creditsCents / 100).toFixed(0)} € de crédits
            </p>
            <button
              onClick={() => buyPack(pack.id)}
              disabled={buying === pack.id}
              className="mt-4 w-full rounded-lg bg-accent py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {buying === pack.id ? "…" : "Acheter"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
