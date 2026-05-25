"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthNav } from "@/components/AuthNav";

const NAV = [
  { href: "/explore", label: "Explorer" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    async function loadAdmin() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
      setIsAdmin(!!profile?.is_admin);
    }
    loadAdmin();
  }, [pathname]);

  const links = NAV.filter((l) => !l.adminOnly || isAdmin);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Zap className="h-7 w-7 text-accent" strokeWidth={2.5} />
          <span className="font-display text-xl font-bold tracking-tight text-ink">
            Prompta
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`text-sm font-medium transition-colors ${
                pathname.startsWith(item.href)
                  ? "text-accent"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/explore"
            prefetch
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-card2 hover:text-ink"
            aria-label="Rechercher"
          >
            <Search className="h-4 w-4" />
          </Link>
          <AuthNav />
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t border-line bg-card px-4 py-3 md:hidden">
          <ul className="space-y-1">
            {links.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch
                  className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
                    pathname.startsWith(item.href)
                      ? "bg-accent/10 text-accent"
                      : "text-ink hover:bg-card2"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
