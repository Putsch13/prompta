import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Star,
  Download,
  Calendar,
  Tag,
  Cpu,
  Clock,
  Key,
  BadgeCheck,
  Plug,
  Server,
} from "lucide-react";
import {
  AI_MODELS,
  TECH_RUNTIMES,
  INTEGRATIONS,
} from "@/lib/catalogs";
import { BuyButton } from "@/components/BuyButton";
import { ReviewForm } from "@/components/ReviewForm";
import { ReportButton } from "@/components/ReportButton";
import { RunPartnerButton } from "@/components/RunPartnerButton";
import { RunPanel } from "@/components/run/RunPanel";
import { SubscribeButton } from "@/components/SubscribeButton";
import { parseListingEnv, envFieldsFromManifest } from "@/lib/agent/env";

export const revalidate = 3600;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://prompta.app";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("title, description, type, slug")
    .eq("slug", params.slug)
    .eq("status", "published")
    .single();

  if (!listing) return { title: "Prompt introuvable" };

  const canonicalUrl = `${APP_URL}/listing/${listing.slug}`;

  return {
    title: listing.title,
    description: listing.description || `${listing.type} sur Prompta`,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: listing.title,
      description: listing.description || undefined,
      type: "website",
      url: canonicalUrl,
    },
  };
}

interface ListingWithTech {
  id: string;
  creator_id: string;
  category_id: string | null;
  type: "prompt" | "agent" | "workflow";
  title: string;
  slug: string;
  description: string | null;
  models: string[];
  tech_stack?: string[];
  integrations?: string[];
  tags: string[];
  price_cents: number;
  subscription_price_cents: number;
  pricing_mode: string;
  currency: string;
  status: string;
  content_flags: string[];
  current_version_id: string | null;
  search_vector: unknown;
  created_at: string;
  updated_at: string;
}

export default async function ListingPage({ params }: Props) {
  const supabase = createClient();

  const { data: rawListing } = await supabase
    .from("listings")
    .select("*")
    .eq("slug", params.slug)
    .eq("status", "published")
    .single();

  if (!rawListing) notFound();

  const listing = rawListing as ListingWithTech;

  // Utilisateur courant
  const { data: { user } } = await supabase.auth.getUser();
  const isOwner = user?.id === listing.creator_id;

  // Achat existant ?
  let alreadyPurchased = false;
  if (user && !isOwner && listing.price_cents > 0) {
    const { data: purchase } = await supabase
      .from("purchases")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("listing_id", listing.id)
      .eq("status", "completed")
      .maybeSingle();
    alreadyPurchased = !!purchase;
  }

  // Abonnement actif ?
  let hasSubscription = false;
  if (user && !isOwner) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("listing_id", listing.id)
      .eq("status", "active")
      .maybeSingle();
    hasSubscription = !!sub;
  }

  // Version courante
  const { data: version } = listing.current_version_id
    ? await supabase
        .from("listing_versions")
        .select("*")
        .eq("id", listing.current_version_id)
        .single()
    : { data: null };

  // Créateur
  const { data: creator } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, is_verified, headline")
    .eq("id", listing.creator_id)
    .single();

  // Vérification KYC du créateur
  const { data: creatorStripeAccount } = await supabase
    .from("stripe_accounts")
    .select("charges_enabled, payouts_enabled")
    .eq("profile_id", listing.creator_id)
    .single();

  const creatorKycComplete =
    creatorStripeAccount?.charges_enabled === true &&
    creatorStripeAccount?.payouts_enabled === true;

  // Avis
  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, rating, body, created_at, author_id")
    .eq("listing_id", listing.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const avgRating = reviews && reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null;

  // Partenaires actifs
  const { data: partners } = await supabase
    .from("partner_integrations")
    .select("id, name, run_url_template, affiliate_param")
    .eq("active", true);

  // Compteurs
  const { count: downloadCount } = await supabase
    .from("downloads")
    .select("*", { count: "exact", head: true })
    .eq("listing_id", listing.id);

  const parsedEnv = parseListingEnv(version?.env, version?.prompt_body);
  const envFields = parsedEnv
    ? envFieldsFromManifest(parsedEnv.manifest)
    : (version?.env as { fields?: { key: string; description: string; required: boolean }[] })?.fields;

  const requiredSecrets = parsedEnv?.manifest.secrets ?? [];
  const meta = parsedEnv?.meta ?? (version?.env as { dependencies?: string; setup_time?: string } | null);

  const isFree = listing.price_cents === 0 && listing.pricing_mode !== "subscription";
  const canSeeFullPrompt = isFree || alreadyPurchased || isOwner || hasSubscription;
  const canUseContent = isFree || alreadyPurchased || isOwner || hasSubscription;

  const promptPreview = version?.prompt_body
    ? canSeeFullPrompt
      ? version.prompt_body
      : version.prompt_body.substring(0, 200) + "…"
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description || undefined,
    offers: {
      "@type": "Offer",
      price: (listing.price_cents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    },
    ...(avgRating !== null && reviews && reviews.length > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: avgRating.toFixed(1),
        reviewCount: reviews.length,
        bestRating: "5",
        worstRating: "1",
      },
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="lg:col-span-2">
          <div className="flex items-start gap-3">
            <span className="inline-block rounded bg-accent-light px-2.5 py-1 text-xs font-medium text-accent">
              {listing.type}
            </span>
            {listing.tags.map((tag) => (
              <Link
                key={tag}
                href={`/explore?q=${tag}`}
                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-muted hover:text-accent"
              >
                #{tag}
              </Link>
            ))}
          </div>

          <h1 className="mt-4 text-3xl font-bold">{listing.title}</h1>

          {listing.description && (
            <p className="mt-4 text-base leading-relaxed text-muted">
              {listing.description}
            </p>
          )}

          {/* Aperçu du prompt */}
          {promptPreview && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold">Aperçu du prompt</h2>
              <div className="mt-3 rounded-xl border border-border bg-gray-50 p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                {promptPreview}
                {!canSeeFullPrompt && (
                  <p className="mt-4 text-center text-sm font-sans font-medium text-accent">
                    Achète pour voir le prompt complet
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Environnement */}
          {meta && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold">Environnement requis</h2>
              <div className="mt-3 space-y-3">
                {envFields && envFields.length > 0 && (
                  <div className="rounded-xl border border-border p-4">
                    <h3 className="flex items-center gap-2 text-sm font-medium">
                      <Key className="h-4 w-4 text-accent" />
                      Variables & clés
                    </h3>
                    <div className="mt-3 space-y-2">
                      {envFields.map((field, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">
                            {field.key}
                          </code>
                          <span className="text-muted">{field.description}</span>
                          {field.required && (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-destructive">
                              requis
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {meta.dependencies && (
                    <div className="rounded-xl border border-border p-4">
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <Cpu className="h-4 w-4 text-accent" />
                        Dépendances
                      </h3>
                      <p className="mt-1 text-sm text-muted">{meta.dependencies}</p>
                    </div>
                  )}
                  {meta.setup_time && (
                    <div className="rounded-xl border border-border p-4">
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <Clock className="h-4 w-4 text-accent" />
                        Temps de setup
                      </h3>
                      <p className="mt-1 text-sm text-muted">{meta.setup_time}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Avis */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold">
              Avis{" "}
              {avgRating !== null && (
                <span className="text-base font-normal text-muted">
                  — {avgRating.toFixed(1)}/5 ({reviews?.length} avis)
                </span>
              )}
            </h2>

            {!reviews || reviews.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Pas encore d&apos;avis pour ce prompt.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < review.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-200"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted">
                        {new Date(review.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    {review.body && (
                      <p className="mt-2 text-sm">{review.body}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <ReviewForm
              listingId={listing.id}
              canReview={!isOwner && (alreadyPurchased || isFree) && !!user}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 space-y-6">
            {/* Prix + CTA */}
            <div className="rounded-xl border border-border bg-card p-6">
              <p className="text-3xl font-bold">
                {listing.price_cents === 0
                  ? "Gratuit"
                  : `${(listing.price_cents / 100).toFixed(2)} €`}
              </p>

              <BuyButton
                listingId={listing.id}
                versionId={listing.current_version_id}
                priceCents={listing.price_cents}
                isFree={isFree}
                alreadyPurchased={alreadyPurchased || hasSubscription}
                isOwner={isOwner}
                creatorKycComplete={isFree || creatorKycComplete}
              />

              {listing.pricing_mode === "subscription" &&
                listing.subscription_price_cents > 0 &&
                !isOwner && (
                  <SubscribeButton
                    listingId={listing.id}
                    priceCents={listing.subscription_price_cents}
                    alreadySubscribed={hasSubscription}
                    creatorKycComplete={creatorKycComplete}
                  />
                )}

              {(listing.type === "agent" || listing.type === "workflow") && (
                <p className="mt-2 text-center text-xs text-ink-faint">
                  <Link href="/dashboard/credits" className="text-accent hover:underline">
                    Lancer avec des crédits
                  </Link>{" "}
                  (option)
                </p>
              )}

              <div className="mt-4 flex items-center justify-between text-sm text-muted">
                <span className="flex items-center gap-1">
                  <Download className="h-3.5 w-3.5" />
                  {downloadCount || 0} téléchargements
                </span>
                {avgRating !== null && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    {avgRating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {/* RunPanel — Copier / Lancer */}
            {(listing.type === "prompt" ? version?.prompt_body : version) && (
              <RunPanel
                listingId={listing.id}
                versionId={listing.current_version_id}
                listingSlug={listing.slug}
                title={listing.title}
                promptBody={canSeeFullPrompt ? version?.prompt_body ?? null : null}
                models={listing.models.length > 0 ? listing.models : ["gpt-4o"]}
                envFields={envFields}
                requiredSecrets={requiredSecrets}
                pricingMode={listing.pricing_mode}
                subscriptionPriceCents={listing.subscription_price_cents}
                hasSubscription={hasSubscription}
                priceCents={listing.price_cents}
                isFree={isFree}
                canAccess={canUseContent}
                type={listing.type}
              />
            )}

            {/* Compatibilité & prérequis */}
            {(listing.models.length > 0 ||
              (listing.tech_stack && listing.tech_stack.length > 0) ||
              (listing.integrations && listing.integrations.length > 0)) && (
              <div className="rounded-xl border border-border p-4 space-y-4">
                <h3 className="text-sm font-semibold">Compatibilité & prérequis</h3>

                {listing.models.length > 0 && (
                  <div>
                    <p className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                      <Cpu className="h-3.5 w-3.5 text-accent" />
                      Modèles IA
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {listing.models.map((m) => {
                        const modelInfo = AI_MODELS.find((am) => am.id === m);
                        return (
                          <span
                            key={m}
                            className="rounded-full bg-accent-light px-2.5 py-0.5 text-xs font-medium text-accent"
                          >
                            {modelInfo?.label ?? m}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {listing.tech_stack && listing.tech_stack.length > 0 && (
                  <div>
                    <p className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                      <Server className="h-3.5 w-3.5 text-accent" />
                      Runtime / Tech
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {listing.tech_stack.map((t) => {
                        const techInfo = TECH_RUNTIMES.find((tr) => tr.id === t);
                        return (
                          <span
                            key={t}
                            className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-ink"
                          >
                            {techInfo?.label ?? t}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {listing.integrations && listing.integrations.length > 0 && (
                  <div>
                    <p className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                      <Plug className="h-3.5 w-3.5 text-accent" />
                      Intégrations
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {listing.integrations.map((i) => {
                        const intInfo = INTEGRATIONS.find((int) => int.id === i);
                        return (
                          <span
                            key={i}
                            className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700"
                          >
                            {intInfo?.label ?? i}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Version */}
            {version && (
              <div className="rounded-xl border border-border p-4">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="h-4 w-4 text-accent" />
                  Version {version.semver}
                </h3>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <Calendar className="h-3 w-3" />
                  {new Date(version.created_at).toLocaleDateString("fr-FR")}
                </p>
                {version.changelog && (
                  <p className="mt-2 text-sm text-muted">{version.changelog}</p>
                )}
              </div>
            )}

            {/* Partenaires — Exécuter dans */}
            {partners && partners.length > 0 && (
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-medium">Exécuter dans</h3>
                <div className="mt-3 space-y-2">
                  {partners.map((p) => {
                    if (!p.run_url_template || !p.name) return null;
                    const url = p.run_url_template
                      .replace("{slug}", listing.slug)
                      .replace("{title}", encodeURIComponent(listing.title))
                      + (p.affiliate_param ? `&${p.affiliate_param}` : "");
                    return (
                      <RunPartnerButton
                        key={p.id}
                        partnerName={p.name}
                        runUrl={url}
                        listingSlug={listing.slug}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Créateur */}
            {creator && (
              <Link
                href={`/u/${creator.username}`}
                className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-accent"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-light text-sm font-bold text-accent">
                  {creator.display_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium">{creator.display_name}</span>
                    {creator.is_verified && (
                      <BadgeCheck className="h-4 w-4 text-accent" />
                    )}
                  </div>
                  <p className="text-xs text-muted">@{creator.username}</p>
                </div>
              </Link>
            )}

            {/* Signaler */}
            {!isOwner && (
              <ReportButton listingId={listing.id} />
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
