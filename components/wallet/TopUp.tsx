"use client";

import { useState, useEffect } from "react";
import { Loader2, Coins } from "lucide-react";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { formatBalanceCents } from "@/lib/billing/display-balance";

interface Props {
  /** Afficher le solde actuel (fetch /api/credits) */
  showBalance?: boolean;
  compact?: boolean;
}

export function TopUp({ showBalance = true, compact = false }: Props) {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(showBalance);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    if (!showBalance) return;
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => setBalance(d.balanceCents ?? 0))
      .finally(() => setLoading(false));
  }, [showBalance]);

  async function buyPack(packId: string) {
    setBuying(packId);
    try {
      const res = await fetch("/api/stripe/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.assign(data.url);
        return; // redirection en cours
      }
    } catch { /* réseau — on rend la main */ }
    setBuying(null);
  }

  const formatted = formatBalanceCents(balance);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {CREDIT_PACKS.map((pack) => (
          <button
            key={pack.id}
            onClick={() => buyPack(pack.id)}
            disabled={buying === pack.id}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50"
          >
            {buying === pack.id ? "…" : `+ ${pack.label}`}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      {showBalance && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-card2 p-4">
          <Coins className="h-6 w-6 text-accent" />
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-ink-soft" />
          ) : (
            <div>
              <p className="text-2xl font-bold text-ink">{formatted.eur} €</p>
              <p className="text-xs text-ink-soft">{formatted.creditUnits} unités crédits</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <button
            key={pack.id}
            onClick={() => buyPack(pack.id)}
            disabled={buying === pack.id}
            className="rounded-xl border border-line bg-card p-4 text-center transition-colors hover:border-accent disabled:opacity-50"
          >
            <p className="font-display text-lg font-bold text-ink">{pack.label}</p>
            <p className="mt-1 text-xs text-ink-soft">
              {(pack.creditsCents / 100).toFixed(0)} € crédits
            </p>
            <span className="mt-3 inline-block text-sm font-medium text-accent">
              {buying === pack.id ? "Redirection…" : "Recharger"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
