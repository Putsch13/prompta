"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins } from "lucide-react";
import { formatBalanceCents } from "@/lib/billing/display-balance";

export function WalletBalanceBadge() {
  const [balance, setBalance] = useState<number | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => {
        if (r.status === 401) return null;
        return r.json();
      })
      .then((d) => {
        if (d?.balanceCents != null) {
          setLoggedIn(true);
          setBalance(d.balanceCents);
        }
      })
      .catch(() => {});
  }, []);

  if (!loggedIn || balance === null) return null;

  const { eur } = formatBalanceCents(balance);

  return (
    <Link
      href="/wallet"
      className="hidden items-center gap-1.5 rounded-full border border-line bg-card2 px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink sm:flex"
      title="Mon wallet"
    >
      <Coins className="h-3.5 w-3.5 text-accent" />
      {eur} €
    </Link>
  );
}
