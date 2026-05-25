"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  User,
  Key,
  Repeat,
  History,
  Coins,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  connexions: Key,
  runs: History,
  credits: Coins,
  abonnements: Repeat,
  payouts: CreditCard,
  profile: User,
};

type NavItem = {
  href: string;
  label: string;
  iconKey: keyof typeof ICONS;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Aperçu", iconKey: "dashboard", exact: true },
  { href: "/dashboard/connexions", label: "Connexions", iconKey: "connexions" },
  { href: "/dashboard/runs", label: "Historique runs", iconKey: "runs" },
  { href: "/dashboard/credits", label: "Crédits", iconKey: "credits" },
  { href: "/dashboard/abonnements", label: "Abonnements", iconKey: "abonnements" },
  { href: "/dashboard/payouts", label: "Revenus", iconKey: "payouts" },
  { href: "/dashboard/edit-profile", label: "Profil", iconKey: "profile" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-24 space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        const Icon = ICONS[item.iconKey];

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent/10 text-accent"
                : "text-ink-soft hover:bg-card hover:text-ink"
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
