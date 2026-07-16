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
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
      <ApprovalNotifier />
    </div>
  );
}
