import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Check, Download, FileArchive, FileText, ArrowLeft, Play } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ session_id?: string }>;
}

const RUNNABLE_TYPES = new Set(["agent", "workflow"]);

export default async function PurchaseSuccessPage(props: Props) {
  const searchParams = await props.searchParams;
  const sessionId = searchParams.session_id;

  if (!sessionId) {
    redirect("/");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: purchase } = await supabase
    .from("purchases")
    .select(
      `
      id,
      amount_cents,
      tax_cents,
      status,
      version_id,
      listing:listings(
        id,
        title,
        slug,
        type,
        description
      )
    `
    )
    .eq("stripe_checkout_session", sessionId)
    .eq("buyer_id", user.id)
    .single();

  if (!purchase || purchase.status !== "completed") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-ink">
            Paiement en cours de traitement
          </h1>
          <p className="mt-2 text-ink-soft">
            Votre paiement est en cours de vérification. Rafraîchissez la page
            dans quelques instants.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au dashboard
          </Link>
        </div>
      </div>
    );
  }

  const listing = purchase.listing as {
    id: string;
    title: string;
    slug: string;
    type: string;
    description: string | null;
  } | null;

  const totalCents = purchase.amount_cents + (purchase.tax_cents || 0);
  const isRunnable = listing ? RUNNABLE_TYPES.has(listing.type) : false;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <Check className="h-10 w-10 text-green-600" />
        </div>

        <h1 className="mt-6 font-display text-3xl font-bold text-ink">
          Paiement confirmé
        </h1>
        <p className="mt-2 text-ink-soft">
          {isRunnable
            ? "Merci pour votre achat ! Vous pouvez lancer l'agent dès maintenant."
            : "Merci pour votre achat ! Votre bundle est prêt à être téléchargé."}
        </p>

        {listing && (
          <div className="mt-8 rounded-xl border border-line bg-card p-6 text-left">
            <h2 className="font-display text-lg font-semibold text-ink">
              {listing.title}
            </h2>
            <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
              {listing.type}
            </span>

            {!isRunnable && (
              <div className="mt-4 space-y-2 border-t border-line pt-4">
                <div className="flex items-center gap-3 text-sm text-ink-soft">
                  <FileText className="h-4 w-4" />
                  <span>prompt.txt</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-ink-soft">
                  <FileText className="h-4 w-4" />
                  <span>.env.example</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-ink-soft">
                  <FileArchive className="h-4 w-4" />
                  <span>Guide de démarrage</span>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
              <span className="text-ink-soft">Total payé</span>
              <span className="font-display text-lg font-bold text-ink">
                {(totalCents / 100).toFixed(2)} €
              </span>
            </div>
          </div>
        )}

        {isRunnable && listing ? (
          <Link
            href={`/listing/${listing.slug}`}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent font-medium text-white transition-colors hover:bg-accent/90"
          >
            <Play className="h-5 w-5" />
            Lancer l&apos;agent
          </Link>
        ) : (
          purchase.version_id && (
            <a
              href={`/api/download/${purchase.version_id}`}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent font-medium text-white transition-colors hover:bg-accent/90"
            >
              <Download className="h-5 w-5" />
              Télécharger le bundle (.zip)
            </a>
          )
        )}

        <div className="mt-6 flex flex-col gap-2">
          {listing && (
            <Link
              href={`/listing/${listing.slug}`}
              className="text-sm text-accent hover:underline"
            >
              {isRunnable ? "Voir la fiche de l'agent" : "Voir la fiche du prompt"}
            </Link>
          )}
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-1 text-sm text-ink-soft hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour au dashboard
          </Link>
        </div>

        <p className="mt-8 text-xs text-ink-faint">
          Un reçu a été envoyé à votre adresse email.
        </p>
      </div>
    </div>
  );
}
