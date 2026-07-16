"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Users, Shield, ArrowRight, Bell } from "lucide-react";
import { B2B_LANDING_MODE } from "@/lib/flags";

export function B2BSection() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (B2B_LANDING_MODE === "hidden") {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "b2b_landing" }),
    });
    setSubmitted(true);
  }

  if (B2B_LANDING_MODE === "teaser") {
    return (
      <section className="border-t border-line bg-card py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
            <Bell className="h-3.5 w-3.5" />
            Bientôt
          </span>

          <h2 className="mt-6 font-display text-3xl font-bold text-ink md:text-4xl">
            Prompta for Teams
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-soft">
            Déployez une bibliothèque privée d&apos;agents IA pour votre équipe. Gouvernance,
            permissions et contrôle centralisé — conçu pour les entreprises.
          </p>

          <div className="mx-auto mt-8 grid max-w-md gap-4 text-left sm:grid-cols-3 sm:max-w-2xl">
            <div className="rounded-xl border border-line bg-bg p-4">
              <Building2 className="h-6 w-6 text-accent" />
              <p className="mt-2 text-sm font-medium text-ink">Bibliothèque privée</p>
              <p className="mt-1 text-xs text-ink-soft">Agents internes non publiés</p>
            </div>
            <div className="rounded-xl border border-line bg-bg p-4">
              <Users className="h-6 w-6 text-accent" />
              <p className="mt-2 text-sm font-medium text-ink">Gestion d&apos;équipe</p>
              <p className="mt-1 text-xs text-ink-soft">Invitations et rôles</p>
            </div>
            <div className="rounded-xl border border-line bg-bg p-4">
              <Shield className="h-6 w-6 text-accent" />
              <p className="mt-2 text-sm font-medium text-ink">Gouvernance</p>
              <p className="mt-1 text-xs text-ink-soft">Audit et conformité</p>
            </div>
          </div>

          {submitted ? (
            <p className="mt-8 text-sm font-medium text-green-600">
              Merci ! Vous serez prévenu(e) au lancement.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto mt-8 flex max-w-md gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                className="h-12 flex-1 rounded-lg border border-line bg-bg px-4 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent/90"
              >
                Être prévenu
              </button>
            </form>
          )}
        </div>
      </section>
    );
  }

  // Mode "full"
  return (
    <section className="border-t border-line bg-card py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-display text-3xl font-bold text-ink md:text-4xl">
              Prompta for Teams
            </h2>
            <p className="mt-4 text-lg text-ink-soft">
              Déployez une bibliothèque privée d&apos;agents IA pour votre équipe.
              Gouvernance, permissions et contrôle centralisé — conçu pour les
              entreprises.
            </p>

            <ul className="mt-6 space-y-4">
              <li className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 text-accent" />
                <div>
                  <p className="font-medium text-ink">Bibliothèque privée</p>
                  <p className="text-sm text-ink-soft">
                    Agents et workflows internes, privés et partagés à votre équipe uniquement.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 text-accent" />
                <div>
                  <p className="font-medium text-ink">Gestion d&apos;équipe</p>
                  <p className="text-sm text-ink-soft">
                    Invitations, rôles (admin, membre, viewer), et quotas par utilisateur.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 text-accent" />
                <div>
                  <p className="font-medium text-ink">Gouvernance & audit</p>
                  <p className="text-sm text-ink-soft">
                    Logs d&apos;exécution, conformité RGPD, SSO et 2FA.
                  </p>
                </div>
              </li>
            </ul>

            <Link
              href="/teams"
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent/90"
            >
              Découvrir Prompta for Teams
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="relative rounded-2xl border border-line bg-bg p-8 shadow-lg">
            <div className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white">
              Entreprises
            </div>
            <p className="text-2xl font-bold text-ink">Tarif sur mesure</p>
            <p className="mt-2 text-sm text-ink-soft">
              Adapté à la taille de votre équipe et vos besoins.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-ink">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Nombre d&apos;utilisateurs illimité
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Support prioritaire
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                SLA & facturation entreprise
              </li>
            </ul>
            <Link
              href="/contact?plan=teams"
              className="mt-6 block w-full rounded-lg border border-accent py-2.5 text-center text-sm font-medium text-accent hover:bg-accent-light"
            >
              Contacter l&apos;équipe commerciale
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
