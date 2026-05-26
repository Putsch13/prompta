import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCreditBalance } from "@/lib/credits";
import { costToCredits, creditsToEur } from "@/lib/billing/credits";
import { estimateMaxCost } from "@/lib/billing/run-cost";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p>Connectez-vous pour accéder à votre wallet.</p>
        <Link href="/login" className="mt-4 inline-block text-accent hover:underline">
          Se connecter
        </Link>
      </div>
    );
  }

  const balance = await getCreditBalance(user.id);
  const sampleCost = estimateMaxCost({ stepCount: 2, maxTokens: 4000, maxToolCalls: 2 });
  const sampleCredits = costToCredits(sampleCost);

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, status, listing:listings(title, slug)")
    .eq("user_id", user.id)
    .eq("status", "active") as { data: Array<{ id: string; status: string; listing: { title?: string; slug?: string } | null }> | null };

  const { data: runs } = await supabase
    .from("listing_agent_runs")
    .select("id, status, created_at, listing:listings(title)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10) as { data: Array<{ id: string; status: string; listing: { title?: string } | null }> | null };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-ink">Mon wallet</h1>
      <p className="mt-1 text-sm text-ink-soft">Vos agents, crédits et connexions en un seul endroit.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-xs font-medium uppercase text-ink-faint">Solde crédits</p>
          <p className="mt-1 text-3xl font-bold text-ink">{(balance / 2).toFixed(0)} cr.</p>
          <p className="text-sm text-ink-soft">≈ {(balance / 100).toFixed(2)} € disponibles</p>
          <Link
            href="/dashboard/credits"
            className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Recharger
          </Link>
          <p className="mt-2 text-xs text-ink-faint">
            Run agent type ≈ {sampleCredits} crédits (~{creditsToEur(sampleCredits).toFixed(2)} €)
          </p>
        </div>

        <div className="rounded-xl border border-line bg-card p-5">
          <p className="text-xs font-medium uppercase text-ink-faint">Connexions</p>
          <p className="mt-2 text-sm text-ink-soft">Clés API + comptes OAuth (Gmail, Canva…)</p>
          <Link href="/dashboard/connexions" className="mt-3 inline-block text-sm text-accent hover:underline">
            Gérer mes connexions →
          </Link>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Agents abonnés</h2>
        {(!subscriptions || subscriptions.length === 0) && (
          <p className="mt-2 text-sm text-ink-soft">Aucun abonnement actif.</p>
        )}
        <ul className="mt-3 space-y-2">
          {(subscriptions ?? []).map((s) => {
            const listing = s.listing;
            return (
              <li key={s.id} className="flex justify-between rounded-lg border border-line px-4 py-3">
                <span>{listing?.title ?? "Agent"}</span>
                {listing?.slug && (
                  <Link href={`/listing/${listing.slug}`} className="text-sm text-accent hover:underline">
                    Lancer
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Historique récent</h2>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {(runs ?? []).map((r) => {
            const listing = r.listing;
            return (
              <li key={r.id} className="flex justify-between px-4 py-3 text-sm">
                <span>{listing?.title ?? "Run"}</span>
                <span className={r.status === "completed" ? "text-green-600" : "text-ink-soft"}>
                  {r.status}
                </span>
              </li>
            );
          })}
        </ul>
        <Link href="/dashboard/runs" className="mt-2 inline-block text-sm text-accent hover:underline">
          Voir tout l&apos;historique →
        </Link>
      </section>
    </div>
  );
}
