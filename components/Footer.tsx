import Link from "next/link";
import { Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-accent" strokeWidth={2.5} />
              <span className="text-lg font-bold">Prompta</span>
            </Link>
            <p className="mt-3 text-sm text-muted">
              La marketplace des prompts, agents et workflows IA.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Produit</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/explore" className="text-sm text-muted hover:text-foreground transition-colors">
                  Explorer
                </Link>
              </li>
              <li>
                <Link href="/dashboard/new" className="text-sm text-muted hover:text-foreground transition-colors">
                  Publier
                </Link>
              </li>
              <li>
                <Link href="/teams" className="text-sm text-muted hover:text-foreground transition-colors">
                  Teams
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Builders</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/dashboard" className="text-sm text-muted hover:text-foreground transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/dashboard/payouts" className="text-sm text-muted hover:text-foreground transition-colors">
                  Revenus
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Légal</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/legal/terms" className="text-sm text-muted hover:text-foreground transition-colors">
                  CGU
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-sm text-muted hover:text-foreground transition-colors">
                  Confidentialité
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-center text-sm text-muted">
          &copy; {new Date().getFullYear()} Prompta. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
