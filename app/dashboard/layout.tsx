import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardNav } from "@/components/DashboardNav";
import { ApprovalNotifier } from "@/components/run/ApprovalNotifier";
import { createClient } from "@/lib/supabase/server";
import { grantWelcomeCredits } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Crédits de bienvenue (2 €) — idempotent, s'applique aussi aux comptes
  // existants à leur prochaine visite.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await grantWelcomeCredits(user.id);

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-page px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-56">
            <DashboardNav />
            <hr className="my-3 border-line" />
            <Link
              href="/dashboard/new"
              prefetch
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              <Plus className="h-4 w-4" />
              Nouvel agent
            </Link>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
      <ApprovalNotifier />
    </div>
  );
}
