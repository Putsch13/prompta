import Link from "next/link";
import { Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <Zap className="h-6 w-6 text-accent" strokeWidth={2.5} />
              <span className="text-lg font-bold">Prompta</span>
            </Link>
            <p className="mt-3 text-sm text-ink-soft">
              Construis, héberge et supervise tes agents IA — connectés à tes vraies apps.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Produit</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/dashboard/new" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Créer un agent
                </Link>
              </li>
              <li>
                <Link href="/pricing" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Tarifs
                </Link>
              </li>
              <li>
                <Link href="/aide" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Aide & FAQ
                </Link>
              </li>
              <li>
                <Link href="/dashboard/connexions" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  1000+ applications
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Compte</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/dashboard" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/dashboard/abonnements" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Mon plan
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Légal</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/legal/terms" className="text-sm text-ink-soft transition-colors hover:text-ink">
                  CGU
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Confidentialité
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-line pt-6 text-center text-sm text-ink-faint">
          &copy; {new Date().getFullYear()} Prompta. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
