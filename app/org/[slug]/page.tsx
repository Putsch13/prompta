import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { OrgImportPanel } from "@/components/org/OrgImportPanel";
import { OrgApprovalPanel } from "@/components/org/OrgApprovalPanel";
import { OrgBillingPanel } from "@/components/org/OrgBillingPanel";

export const dynamic = "force-dynamic";

interface Props {
  params: { slug: string };
  searchParams: { subscribed?: string };
}

export default async function OrgPage({ params, searchParams }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, seat_limit, subscription_status")
    .eq("slug", params.slug)
    .single();

  if (!org) notFound();

  const { data: myMembership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single();

  if (!myMembership) notFound();

  const isAdmin = myMembership.role === "admin";
  const isEditor = myMembership.role === "admin" || myMembership.role === "editor";

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

  const { data: auditLog } = await supabase
    .from("org_audit_log")
    .select("id, action, metadata, created_at, user_id")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const pending = (orgListings ?? []).filter((l) => l.status === "pending_approval");
  const approved = (orgListings ?? []).filter((l) => l.status === "approved");

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-page px-4 py-12">
        {searchParams.subscribed === "1" && (
          <div className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
            Abonnement entreprise activé.
          </div>
        )}

        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-accent">
            Organisation · {org.plan}
          </p>
          <h1 className="font-display text-3xl font-bold text-ink">{org.name}</h1>
          <p className="mt-2 text-ink-soft">
            {memberRows?.length ?? 0} / {org.seat_limit} sièges ·{" "}
            Abonnement : {org.subscription_status ?? "inactive"}
          </p>
        </div>

        <OrgApprovalPanel orgSlug={org.slug} pending={pending} isAdmin={isAdmin} />

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-xl border border-line bg-card p-6">
            <h2 className="font-display text-lg font-semibold text-ink">
              Bibliothèque privée
            </h2>
            {approved.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">
                Aucun contenu approuvé. Importez un agent du marketplace.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {approved.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between rounded-lg bg-card2 px-3 py-2 text-sm"
                  >
                    <span>{l.title}</span>
                    <span className="text-xs text-ink-faint">{l.type}</span>
                  </li>
                ))}
              </ul>
            )}
            <OrgImportPanel orgSlug={org.slug} isEditor={isEditor} />
            <Link
              href="/explore"
              className="mt-3 inline-block text-sm text-accent hover:underline"
            >
              Parcourir le marketplace →
            </Link>
          </section>

          <section className="rounded-xl border border-line bg-card p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Membres</h2>
            <ul className="mt-4 space-y-2">
              {(memberRows ?? []).map((m) => {
                const profile = profileMap[m.user_id];
                return (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between rounded-lg bg-card2 px-3 py-2 text-sm"
                  >
                    <span>{profile?.display_name ?? "Membre"}</span>
                    <span className="text-xs capitalize text-ink-faint">{m.role}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <OrgBillingPanel
          orgSlug={org.slug}
          currentPlan={org.plan ?? "starter"}
          subscriptionStatus={org.subscription_status ?? "inactive"}
          isAdmin={isAdmin}
        />

        <section className="mt-8 rounded-xl border border-line bg-card p-6">
          <h2 className="font-display text-lg font-semibold text-ink">
            Journal d&apos;audit
          </h2>
          {(!auditLog || auditLog.length === 0) ? (
            <p className="mt-4 text-sm text-ink-soft">Aucune action enregistrée.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {auditLog.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg bg-card2 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-ink">{entry.action}</span>
                  <span className="text-ink-faint">
                    {new Date(entry.created_at ?? Date.now()).toLocaleString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
