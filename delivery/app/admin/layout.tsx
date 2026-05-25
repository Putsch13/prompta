/**
 * app/admin/layout.tsx
 * ────────────────────────────────────────────────────────────
 * Coquille de l'espace admin. Le garde requireAdmin() bloque
 * tout accès non autorisé avant même le rendu.
 */

import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin(); // redirige si non-admin

  return (
    <div className="min-h-screen bg-[#F4F2EE]">
      <header className="border-b border-[#E4E1D8] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#0A66C2] text-sm">
                ⚙️
              </span>
              <span className="font-bold text-[#1B1B18]">Prompta Admin</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              <Link
                href="/admin"
                className="rounded-md px-3 py-1.5 text-[#5C5A52] hover:bg-[#F4F2EE]"
              >
                KPI
              </Link>
              <Link
                href="/admin/agents"
                className="rounded-md px-3 py-1.5 text-[#5C5A52] hover:bg-[#F4F2EE]"
              >
                Agents
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#9E9B90]">
            <span>{admin.display_name}</span>
            <Link href="/" className="text-[#0A66C2] hover:underline">
              ← Retour au site
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
