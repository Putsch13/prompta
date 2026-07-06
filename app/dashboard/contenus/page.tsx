import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAgentsOverview } from "@/lib/library/agent-overview";
import { AgentsGrid } from "@/components/dashboard/AgentsGrid";

export const dynamic = "force-dynamic";

export default async function ContenusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const agents = await fetchAgentsOverview(user.id);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Mes agents</h1>
          <p className="mt-2 text-ink-soft">
            Chaque agent, son état, son dernier run et ses livrables — modifie, lance, contrôle.
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Nouvel agent
        </Link>
      </div>

      <AgentsGrid agents={agents} />
    </div>
  );
}
