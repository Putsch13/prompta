import Link from "next/link";
import {
  LayoutDashboard,
  CreditCard,
  User,
  Plus,
  Key,
  Repeat,
  History,
  Coins,
} from "lucide-react";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/dashboard", label: "Aperçu", icon: LayoutDashboard },
  { href: "/dashboard/connexions", label: "Connexions", icon: Key },
  { href: "/dashboard/runs", label: "Historique runs", icon: History },
  { href: "/dashboard/credits", label: "Crédits", icon: Coins },
  { href: "/dashboard/abonnements", label: "Abonnements", icon: Repeat },
  { href: "/dashboard/payouts", label: "Revenus", icon: CreditCard },
  { href: "/dashboard/edit-profile", label: "Profil", icon: User },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-page px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-56">
            <nav className="sticky top-24 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-card hover:text-ink"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
              <hr className="my-3 border-line" />
              <Link
                href="/dashboard/new"
                className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                <Plus className="h-4 w-4" />
                Nouveau prompt
              </Link>
            </nav>
          </aside>
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
