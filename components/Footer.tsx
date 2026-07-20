import Link from "next/link";
import { Logo } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto max-w-page px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo size={24} animate={false} />
              <span className="text-lg font-bold">Prompta</span>
            </Link>
            <p className="mt-3 text-sm text-ink-soft">
              L&apos;assistant IA dans ton navigateur — il voit ton écran, agit sur tes apps,
              et tu valides.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Produit</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/prompta-partout" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Installer Prompta partout
                </Link>
              </li>
              <li>
                <Link href="/quick" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  L&apos;assistant (web)
                </Link>
              </li>
              <li>
                <Link href="/cas-usage" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Cas d&apos;usage
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
                  Connexions
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Compte</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/dashboard/runs" prefetch className="text-sm text-ink-soft transition-colors hover:text-ink">
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
                <Link href="/legal/mentions" className="text-sm text-ink-soft transition-colors hover:text-ink">
                  Mentions légales
                </Link>
              </li>
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

        <div className="mt-10 space-y-2 border-t border-line pt-6 text-center">
          <p className="text-xs leading-relaxed text-ink-faint">
            Prompta est édité par <span className="text-ink-soft">Puccini EI</span> — SIREN 932 699 697 —
            824 chemin de la Daby, 83330 Le Beausset, France — contact@prompta.fr · 06 74 81 80 67
          </p>
          <p className="text-xs text-ink-faint">
            TVA non applicable, art. 293 B du CGI · Hébergé par Render · Données Supabase (UE) · Paiements Stripe
          </p>
          <p className="text-sm text-ink-faint">
            &copy; {new Date().getFullYear()} Prompta. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
