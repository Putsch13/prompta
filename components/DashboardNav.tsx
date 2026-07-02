"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CreditCard,
  User,
  Key,
  Repeat,
  History,
  Coins,
  Bot,
  FileText,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  contenus: Bot,
  documents: FileText,
  connexions: Key,
  runs: History,
  validations: ClipboardCheck,
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

// Navigation centrée agent (build → run → debug), à la Render.
const PRIMARY_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Aperçu", iconKey: "dashboard", exact: true },
  { href: "/dashboard/contenus", label: "Mes agents", iconKey: "contenus" },
  { href: "/dashboard/runs", label: "Runs & logs", iconKey: "runs" },
  { href: "/dashboard/connexions", label: "Connexions", iconKey: "connexions" },
  { href: "/dashboard/validations", label: "Validations", iconKey: "validations" },
];

// Compte & facturation (secondaire).
const SECONDARY_ITEMS: NavItem[] = [
  { href: "/dashboard/abonnements", label: "Abonnements", iconKey: "abonnements" },
  { href: "/dashboard/credits", label: "Crédits", iconKey: "credits" },
  { href: "/dashboard/payouts", label: "Revenus", iconKey: "payouts" },
  { href: "/dashboard/documents", label: "Documents", iconKey: "documents" },
  { href: "/dashboard/edit-profile", label: "Profil", iconKey: "profile" },
];

export function DashboardNav() {
  const pathname = usePathname();
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [activeRuns, setActiveRuns] = useState(0);

  // Poll léger : les badges vivent même si on reste sur la même page
  // (avant : rafraîchi uniquement au changement de route → notifs invisibles).
  useEffect(() => {
    const load = () =>
      fetch("/api/activity/summary")
        .then((r) => (r.ok ? r.json() : {}))
        .then((d: { pendingApprovals?: number; activeRuns?: number }) => {
          setPendingApprovals(d.pendingApprovals ?? 0);
          setActiveRuns(d.activeRuns ?? 0);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [pathname]);

  const renderItem = (item: NavItem) => {
    const active = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

    const Icon = ICONS[item.iconKey];
    const badge = item.iconKey === "validations" && pendingApprovals > 0 ? pendingApprovals : 0;
    const runningBadge = item.iconKey === "runs" && activeRuns > 0 ? activeRuns : 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch
        className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:shrink ${
          active
            ? "bg-accent/10 text-accent"
            : "text-ink-soft hover:bg-card hover:text-ink"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{item.label}</span>
        {badge > 0 && (
          <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
        {runningBadge > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
            {runningBadge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="sticky top-24">
      {/* Mobile : barre horizontale scrollable. Desktop : nav verticale. */}
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {PRIMARY_ITEMS.map(renderItem)}
        <span className="hidden px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-ink-faint lg:block">
          Compte &amp; facturation
        </span>
        {SECONDARY_ITEMS.map(renderItem)}
      </div>
    </nav>
  );
}
