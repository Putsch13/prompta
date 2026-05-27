/**
 * app/admin/layout.tsx
 * Coquille de l'espace admin — KPI, agents, modération.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-page items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm text-white">
                ⚙
              </span>
              <span className="font-display font-bold text-ink">Prompta Admin</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-card2 hover:text-ink"
              >
                KPI
              </Link>
              <Link
                href="/admin/agents"
                className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-card2 hover:text-ink"
              >
                Agents
              </Link>
              <Link
                href="/admin/moderation"
                className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-card2 hover:text-ink"
              >
                Modération
              </Link>
              <Link
                href="/admin/worker-health"
                className="rounded-md px-3 py-1.5 text-ink-soft hover:bg-card2 hover:text-ink"
              >
                Worker
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-ink-faint">
            <span>{admin.display_name}</span>
            <Link href="/" className="text-accent hover:underline">
              ← Retour au site
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-page px-6 py-8">{children}</main>
    </div>
  );
}
