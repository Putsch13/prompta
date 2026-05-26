"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Key, History, Coins, Repeat, Sparkles } from "lucide-react";

const ITEMS = [
  { href: "/wallet", label: "Vue d'ensemble", icon: Wallet, exact: true },
  { href: "/wallet/credits", label: "Crédits", icon: Coins },
  { href: "/dashboard/connexions", label: "Connexions", icon: Key },
  { href: "/dashboard/runs", label: "Historique runs", icon: History },
  { href: "/dashboard/abonnements", label: "Abonnements", icon: Repeat },
  { href: "/listing/assistant-email-pro", label: "Agent démo", icon: Sparkles },
];

export function WalletNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-24 space-y-1">
      {ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-accent/10 text-accent" : "text-ink-soft hover:bg-card hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
