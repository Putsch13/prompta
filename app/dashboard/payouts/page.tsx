"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  CreditCard,
  CheckCircle,
  ExternalLink,
  DollarSign,
} from "lucide-react";

export default function PayoutsPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("connected") === "true";

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [stripeAccount, setStripeAccount] = useState<{
    charges_enabled: boolean;
    payouts_enabled: boolean;
  } | null>(null);

  const [sales, setSales] = useState<
    { id: string; amount_cents: number; platform_fee_cents: number; created_at: string; status: string }[]
  >([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [mrrCents, setMrrCents] = useState(0);
  const [activeSubs, setActiveSubs] = useState(0);
  const [proRevshareCents, setProRevshareCents] = useState(0);
  const [proRunsThisMonth, setProRunsThisMonth] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: account } = await supabase
        .from("stripe_accounts")
        .select("charges_enabled, payouts_enabled")
        .eq("profile_id", user.id)
        .single();

      setStripeAccount(account);

      const { data: listings } = await supabase
        .from("listings")
        .select("id")
        .eq("creator_id", user.id);

      const listingIds = (listings || []).map((l) => l.id);

      if (listingIds.length > 0) {
        const { data: purchases } = await supabase
          .from("purchases")
          .select("id, amount_cents, platform_fee_cents, created_at, status")
          .in("listing_id", listingIds)
          .order("created_at", { ascending: false });

        if (purchases) {
          setSales(purchases);
          setTotalRevenue(
            purchases
              .filter((p) => p.status === "completed")
              .reduce((sum, p) => sum + (p.amount_cents - p.platform_fee_cents), 0)
          );
        }

        const statsRes = await fetch("/api/payouts/stats");
        if (statsRes.ok) {
          const stats = await statsRes.json();
          setMrrCents(stats.mrrCents ?? 0);
          setActiveSubs(stats.activeSubs ?? 0);
          setProRevshareCents(stats.proRevshareCents ?? 0);
          setProRunsThisMonth(stats.proRunsThisMonth ?? 0);
        }
      }

      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function handleConnect() {
    setConnecting(true);
    const res = await fetch("/api/stripe/connect", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-ink">
        Revenus & Payouts
      </h1>

      {justConnected && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success">
          <CheckCircle className="h-4 w-4" />
          Compte Stripe Connect lié avec succès !
        </div>
      )}

      {/* Stripe Connect */}
      <div className="mt-8 rounded-xl border border-line bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-5 w-5 text-accent" />
          Stripe Connect
        </h2>

        {!stripeAccount ? (
          <div className="mt-4">
            <p className="text-sm text-ink-soft">
              Connecte ton compte Stripe pour recevoir les paiements de tes
              prompts et agents.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="mt-4 flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  Connecter Stripe
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${stripeAccount.charges_enabled ? "bg-success" : "bg-warning"}`}
              />
              Paiements : {stripeAccount.charges_enabled ? "Activés" : "En attente de vérification"}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`h-2 w-2 rounded-full ${stripeAccount.payouts_enabled ? "bg-success" : "bg-warning"}`}
              />
              Virements : {stripeAccount.payouts_enabled ? "Activés" : "En attente"}
            </div>
            {!stripeAccount.charges_enabled && (
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="mt-2 text-sm font-medium text-accent hover:underline"
              >
                Compléter la vérification
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats revenus */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <DollarSign className="h-4 w-4 text-accent" />
            Revenus nets (one-shot)
          </div>
          <p className="mt-2 text-3xl font-bold">
            {(totalRevenue / 100).toFixed(2)} €
          </p>
        </div>
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <CreditCard className="h-4 w-4 text-accent" />
            MRR (abonnements)
          </div>
          <p className="mt-2 text-3xl font-bold">{(mrrCents / 100).toFixed(2)} €</p>
          <p className="mt-1 text-xs text-ink-faint">{activeSubs} abonné(s) actif(s)</p>
        </div>
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <CreditCard className="h-4 w-4 text-accent" />
            Ventes totales
          </div>
          <p className="mt-2 text-3xl font-bold">{sales.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <DollarSign className="h-4 w-4 text-accent" />
            Revenu combiné
          </div>
          <p className="mt-2 text-3xl font-bold">
            {((totalRevenue + mrrCents) / 100).toFixed(2)} €
          </p>
        </div>
      </div>

      {(proRunsThisMonth > 0 || proRevshareCents > 0) && (
        <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-5">
          <p className="text-sm font-medium text-ink">Prompta Pro — ce mois</p>
          <p className="mt-1 text-sm text-ink-soft">
            {proRunsThisMonth} run(s) via abonnés Pro · part estimée{" "}
            <strong>{(proRevshareCents / 100).toFixed(2)} €</strong>
          </p>
        </div>
      )}

      {/* Historique des ventes */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Historique des ventes</h2>
        {sales.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">Aucune vente pour le moment.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {sales.map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between rounded-lg border border-line bg-card p-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {(sale.amount_cents / 100).toFixed(2)} €
                  </p>
                  <p className="text-xs text-ink-soft">
                    Commission : {(sale.platform_fee_cents / 100).toFixed(2)} € ·
                    Net : {((sale.amount_cents - sale.platform_fee_cents) / 100).toFixed(2)} €
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      sale.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : sale.status === "refunded"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {sale.status === "completed" ? "Payé" : sale.status === "refunded" ? "Remboursé" : sale.status}
                  </span>
                  <p className="mt-1 text-xs text-ink-soft">
                    {new Date(sale.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
