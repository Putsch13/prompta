import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Shield, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-page items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-accent" />
            <span className="font-display text-lg font-semibold text-ink">
              Administration
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/admin/moderation"
              className="text-sm font-medium text-ink-soft hover:text-accent"
            >
              Modération
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
