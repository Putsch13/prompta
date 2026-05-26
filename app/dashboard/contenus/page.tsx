import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchUserLibrary } from "@/lib/library/user-listings";
import { LibraryTabs } from "@/components/dashboard/LibraryTabs";

export const dynamic = "force-dynamic";

export default async function ContenusPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const library = await fetchUserLibrary(user.id);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Mes agents & prompts</h1>
          <p className="mt-2 text-ink-soft">
            Tout au même endroit : ce que vous avez créé, acheté ou auquel vous êtes abonné.
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> Nouveau
        </Link>
      </div>

      <Suspense fallback={<p className="text-sm text-ink-soft">Chargement…</p>}>
        <LibraryTabs
          created={library.created}
          purchased={library.purchased}
          subscribed={library.subscribed}
        />
      </Suspense>
    </div>
  );
}
