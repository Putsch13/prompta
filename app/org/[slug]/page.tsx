import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: { slug: string };
}

export default async function OrgPage({ params }: Props) {
  const supabase = createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, seat_limit")
    .eq("slug", params.slug)
    .single();

  if (!org) notFound();

  const { data: memberRows } = await supabase
    .from("org_members")
    .select("role, user_id")
    .eq("org_id", org.id);

  const memberIds = (memberRows ?? []).map((m) => m.user_id);
  const { data: memberProfiles } = memberIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", memberIds)
    : { data: [] };

  const profileMap = (memberProfiles ?? []).reduce<
    Record<string, { display_name: string; username: string }>
  >((acc, p) => {
    acc[p.id] = p;
    return acc;
  }, {});

  const { data: orgListings } = await supabase
    .from("org_listings")
    .select("id, title, type, status")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-page px-4 py-12">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-accent">
            Organisation · {org.plan}
          </p>
          <h1 className="font-display text-3xl font-bold text-ink">{org.name}</h1>
          <p className="mt-2 text-ink-soft">
            {memberRows?.length ?? 0} / {org.seat_limit} sièges utilisés
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-card p-6">
            <h2 className="font-display text-lg font-semibold text-ink">
              Bibliothèque privée
            </h2>
            {(!orgListings || orgListings.length === 0) ? (
              <p className="mt-4 text-sm text-ink-soft">
                Aucun contenu interne. Importez un agent du marketplace pour démarrer.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {orgListings.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between rounded-lg bg-card2 px-3 py-2 text-sm"
                  >
                    <span>{l.title}</span>
                    <span className="text-xs text-ink-faint">{l.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/explore"
              className="mt-4 inline-block text-sm text-accent hover:underline"
            >
              Importer depuis le marketplace →
            </Link>
          </section>

          <section className="rounded-xl border border-line bg-card p-6">
            <h2 className="font-display text-lg font-semibold text-ink">
              Membres
            </h2>
            <ul className="mt-4 space-y-2">
              {(memberRows ?? []).map((m) => {
                const user = profileMap[m.user_id];
                return (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between rounded-lg bg-card2 px-3 py-2 text-sm"
                  >
                    <span>{user?.display_name ?? "Membre"}</span>
                    <span className="text-xs capitalize text-ink-faint">{m.role}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
