import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCreditBalance } from "@/lib/credits";
import { formatBalanceCents } from "@/lib/billing/display-balance";
import { estimateMaxCost } from "@/lib/billing/run-cost";
import { TopUp } from "@/components/wallet/TopUp";
import { listUserKeys } from "@/lib/keys";
import { listUserConnections } from "@/lib/connections";
import { SIGNATURE_AGENT_SLUG } from "@/lib/templates/signature-email-agent";

export const dynamic = "force-dynamic";

const KEY_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  mistral: "Mistral",
  serper: "Serper",
};

export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="py-16 text-center">
        <p>Connectez-vous pour accéder à votre wallet.</p>
        <Link href="/login" className="mt-4 inline-block text-accent hover:underline">
          Se connecter
        </Link>
      </div>
    );
  }

  const balance = await getCreditBalance(user.id);
  const formatted = formatBalanceCents(balance);
  const sampleCost = estimateMaxCost({ stepCount: 2, maxTokens: 4000, maxToolCalls: 0 });
  const sampleRunCredits = formatted.estimateRunCredits(sampleCost);

  const keys = await listUserKeys(user.id);
  const connections = await listUserConnections(user.id);
  const connectedCount = connections.filter((c) => c.status === "connected").length;

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, status, listing:listings(title, slug)")
    .eq("user_id", user.id)
    .eq("status", "active") as {
    data: Array<{ id: string; listing: { title?: string; slug?: string } | null }> | null;
  };

  const { data: runs } = await supabase
    .from("listing_agent_runs")
    .select("id, status, created_at, dry_run, listing:listings(title, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8) as {
    data: Array<{
      id: string;
      status: string;
      dry_run?: boolean;
      listing: { title?: string; slug?: string } | null;
    }> | null;
  };

  let activity: { id: string; action_label: string; simulated: boolean }[] = [];
  try {
    const { data } = await supabase
      .from("user_run_activity")
      .select("id, action_label, simulated, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    activity = data ?? [];
  } catch {
    activity = [];
  }

  const keysOk = keys.filter((k) => k.is_valid).length;
  const keysTotal = keys.length;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Mon wallet</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Agents, crédits, connexions et activité — tout au même endroit.
      </p>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-line bg-card p-5 lg:col-span-1">
          <p className="text-xs font-medium uppercase text-ink-faint">Solde disponible</p>
          <p className="mt-1 font-display text-3xl font-bold text-ink">{formatted.eur} €</p>
          <p className="text-sm text-ink-soft">{formatted.creditUnits} unités crédits</p>
          <Link
            href="/wallet/credits"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Recharger
          </Link>
          <p className="mt-3 text-xs text-ink-faint">
            Run agent type ≈ {sampleRunCredits} cr. (~{(sampleCost / 100).toFixed(2)} € coût max)
          </p>
        </div>

        <div className="rounded-xl border border-line bg-card p-5 lg:col-span-1">
          <p className="text-xs font-medium uppercase text-ink-faint">Connexions</p>
          <p className="mt-2 text-sm text-ink">
            {keysOk}/{Math.max(keysTotal, 1)} clé(s) valide(s) · {connectedCount} compte(s) OAuth
          </p>
          <ul className="mt-3 space-y-1 text-xs text-ink-soft">
            {keys.slice(0, 4).map((k) => (
              <li key={k.id} className="flex justify-between">
                <span>{KEY_LABELS[k.provider] ?? k.provider}</span>
                <span className={k.is_valid ? "text-green-600" : "text-amber-600"}>
                  {k.is_valid ? `…${k.last4}` : "à configurer"}
                </span>
              </li>
            ))}
            {keys.length === 0 && <li>Aucune clé — configurez pour lancer en BYOK.</li>}
          </ul>
          <Link href="/dashboard/connexions" className="mt-3 inline-block text-sm text-accent hover:underline">
            Gérer connexions →
          </Link>
        </div>

        <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 lg:col-span-1">
          <p className="text-xs font-medium uppercase text-accent">Essayer la démo</p>
          <p className="mt-2 text-sm text-ink-soft">
            Agent signature : réponses email pro en 2 étapes.
          </p>
          <Link
            href={`/listing/${SIGNATURE_AGENT_SLUG}`}
            className="mt-4 inline-block rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10"
          >
            Lancer Assistant Email Pro
          </Link>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Recharge rapide</h2>
        <div className="mt-4">
          <TopUp showBalance={false} compact />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Agents abonnés</h2>
        {(!subscriptions || subscriptions.length === 0) && (
          <p className="mt-2 text-sm text-ink-soft">Aucun abonnement actif.</p>
        )}
        <ul className="mt-3 space-y-2">
          {(subscriptions ?? []).map((s) => (
            <li key={s.id} className="flex justify-between rounded-lg border border-line px-4 py-3">
              <span>{s.listing?.title ?? "Agent"}</span>
              {s.listing?.slug && (
                <Link href={`/listing/${s.listing.slug}`} className="text-sm text-accent hover:underline">
                  Lancer
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Runs récents</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {(runs ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-soft">Aucun run pour l&apos;instant.</li>
            )}
            {(runs ?? []).map((r) => (
              <li key={r.id} className="flex justify-between px-4 py-3 text-sm">
                <span>
                  {r.listing?.title ?? "Run"}
                  {r.dry_run && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                      aperçu
                    </span>
                  )}
                </span>
                <span className={r.status === "completed" ? "text-green-600" : "text-ink-soft"}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/runs" className="mt-2 inline-block text-sm text-accent hover:underline">
            Voir tout l&apos;historique →
          </Link>
        </div>

        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Journal d&apos;activité</h2>
          <p className="mt-1 text-xs text-ink-faint">Actions exécutées (ou simulées) par vos agents.</p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {(activity).length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-ink-soft">
                Lancez un agent pour voir l&apos;activité ici.
              </li>
            )}
            {activity.map((a) => (
              <li key={a.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between">
                  <span>{a.action_label}</span>
                  {a.simulated && (
                    <span className="text-[10px] uppercase text-amber-600">simulé</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
