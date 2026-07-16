import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseListingEnv } from "@/lib/agent/env";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { listUserKeys, type KeyProvider } from "@/lib/keys";
import { getCreditBalance } from "@/lib/credits";
import { costToCredits, CREDIT_VALUE_CENTS } from "@/lib/billing/credits";
import { estimateMaxCost } from "@/lib/billing/run-cost";
import { getFreeRunsRemaining } from "@/lib/billing/free-quota";
import { hasPlatformPro } from "@/lib/platform-access";
import { isSubscriptionAccessActive } from "@/lib/subscriptions/active";
import { buildContract } from "@/lib/agent/contract";
import { preflightMissing } from "@/lib/agent/resolve-interface";

export const dynamic = "force-dynamic";

export type RunMode = "byok" | "credits" | "free_quota" | "blocked";

export interface PreflightResult {
  canRun: boolean;
  mode: RunMode;
  missingKeys: string[];
  missingConnectors: string[];
  /**
   * Inputs/ressources que l'abonné doit fournir avant le run (Pilier B).
   * Source unique : `resolveAgentInterface(contract, { phase: "preflight" })`.
   */
  missingInputs?: Array<{
    key: string;
    label: string;
    kind: string;
    widget: string;
    message: string;
    resourceType?: string;
    connector?: string;
  }>;
  connectorAccounts?: Array<{
    connectorId: string;
    label: string;
    accountEmail?: string | null;
    accountName?: string | null;
    workspaceName?: string | null;
  }>;
  connectorHealthIssues?: Array<{ connectorId: string; code: string; message: string }>;
  estimatedCostCents: number;
  estimatedCredits: number;
  creditBalance: number;
  freeRunsRemaining: number;
  reason?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { listingId, versionId } = body as {
    listingId: string;
    versionId: string;
  };

  if (!listingId || !versionId) {
    return NextResponse.json({ error: "listingId et versionId requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: listing } = await admin
    .from("listings")
    .select("id, type, status, creator_id, price_cents")
    .eq("id", listingId)
    .single();

  if (!listing) {
    return NextResponse.json({ error: "Listing introuvable" }, { status: 404 });
  }

  // La version doit appartenir au listing (sinon fuite du manifeste d'un autre
  // agent via son versionId).
  const { data: version } = await admin
    .from("listing_versions")
    .select("env, prompt_body")
    .eq("id", versionId)
    .eq("listing_id", listingId)
    .single();

  if (!version) {
    return NextResponse.json({ error: "Version introuvable pour ce listing" }, { status: 404 });
  }

  const parsedEnv = parseListingEnv(version?.env, version?.prompt_body);

  const isOwner = listing.creator_id === user.id;
  const isFree = listing.price_cents === 0;
  const isPro = await hasPlatformPro(user.id);

  let hasEntitlement = isOwner || isPro;
  if (!hasEntitlement && !isFree) {
    const { data: purchase } = await admin
      .from("purchases")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("listing_id", listingId)
      .eq("status", "completed")
      .maybeSingle();

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("id, status, cancel_at_period_end, current_period_end")
      .eq("user_id", user.id)
      .eq("listing_id", listingId)
      .maybeSingle();

    hasEntitlement = !!(purchase || (subscription && isSubscriptionAccessActive(subscription)));
  }

  const keys = await listUserKeys(user.id);
  const validKeys = keys.filter((k) => k.is_valid);
  const validProviders = new Set(validKeys.map((k) => k.provider));

  const stepCount = parsedEnv?.manifest?.steps?.length ?? 1;
  const maxTokens = parsedEnv?.manifest?.limits?.max_tokens ?? 4096;
  const maxToolCalls = parsedEnv?.manifest?.limits?.max_tool_calls ?? 5;

  const estimatedCostCents = estimateMaxCost({ stepCount, maxTokens, maxToolCalls });
  const estimatedCredits = costToCredits(estimatedCostCents);
  const creditBalance = await getCreditBalance(user.id);
  const freeRunsRemaining = await getFreeRunsRemaining(user.id);

  // Déterminer quelles clés LLM sont nécessaires
  const neededProviders = new Set<string>();
  if (parsedEnv?.manifest) {
    for (const step of parsedEnv.manifest.steps) {
      if (step.type === "llm") {
        const { provider } = resolveModelOrDefault(step.model);
        neededProviders.add(provider);
      }
    }
  }

  const missingKeys: string[] = [];
  neededProviders.forEach((p) => {
    const hasByok = validProviders.has(p as KeyProvider);
    const hasPlatform = !!process.env[`PLATFORM_${p.toUpperCase()}_KEY`];
    if (!hasByok && !hasPlatform) {
      missingKeys.push(p);
    }
  });

  // Connecteurs : SOURCE DE VÉRITÉ UNIQUE = checkConnectorHealth. On calcule la
  // santé une seule fois et on en dérive connectionsStatus + missingConnectors,
  // au lieu d'une logique de matching parallèle (cause des faux « pas connecté »).
  const { checkConnectorHealth, summarizeConnectorAccounts, blockingHealthIssues } =
    await import("@/lib/connectors/connection-health");
  const { runnerRequiredConnectors } = await import("@/lib/agent/run-connectors");

  const requiredConnectors = parsedEnv?.manifest
    ? runnerRequiredConnectors(parsedEnv.manifest, {
        userId: user.id,
        creatorId: listing.creator_id ?? undefined,
      })
    : [];

  const [healthIssues, connectorAccounts] =
    requiredConnectors.length > 0
      ? await Promise.all([
          checkConnectorHealth(user.id, requiredConnectors),
          summarizeConnectorAccounts(user.id, requiredConnectors),
        ])
      : [[], []];
  const blockers = blockingHealthIssues(healthIssues);
  const blockedConnectorIds = new Set(blockers.map((b) => b.connectorId));

  const connectionsStatus: Record<string, { connected: boolean }> = {};
  for (const c of requiredConnectors) {
    connectionsStatus[c] = { connected: !blockedConnectorIds.has(c) };
  }
  const missingConnectors = Array.from(blockedConnectorIds);

  // Pilier B : missingInputs via le Résolveur unique (champs + ressources)
  const missingInputs: NonNullable<PreflightResult["missingInputs"]> = [];
  if (parsedEnv?.manifest) {
    try {
      const contract = buildContract(parsedEnv.manifest.steps);
      const missing = preflightMissing(contract, {
        phase: "preflight",
        runnerId: user.id,
        creatorId: listing.creator_id ?? undefined,
        connections: connectionsStatus,
      });
      for (const m of missing) {
        missingInputs.push({
          key: m.key,
          label: m.label,
          kind: m.kind,
          widget: m.widget ?? "text",
          message: m.message ?? `Renseignez « ${m.label} ».`,
          resourceType: m.resourceType,
          connector: m.connectorParam?.connector,
        });
      }
    } catch {
      // résolveur best-effort, ne bloque pas le preflight si manifest atypique
    }
  }

  // Unique porte de blocage connecteur : un vrai blocage (pas de connexion /
  // token absent ou expiré). Les signaux scope/identité sont remontés via
  // connectorHealthIssues sans bloquer.
  if (blockers.length > 0) {
    return NextResponse.json({
      canRun: false,
      mode: "blocked" as RunMode,
      missingKeys,
      missingConnectors,
      missingInputs,
      connectorAccounts,
      connectorHealthIssues: blockers,
      estimatedCostCents,
      estimatedCredits,
      creditBalance,
      freeRunsRemaining,
      reason: blockers[0].message,
    } satisfies PreflightResult);
  }

  // BYOK complet ?
  const allByok = Array.from(neededProviders).every((p) => validProviders.has(p as KeyProvider));
  if (allByok) {
    return NextResponse.json({
      canRun: true,
      mode: "byok" as RunMode,
      missingKeys: [],
      missingConnectors: [],
      missingInputs,
      estimatedCostCents,
      estimatedCredits,
      creditBalance,
      freeRunsRemaining,
    } satisfies PreflightResult);
  }

  // Clés plateforme dispo + crédits suffisants ?
  if (missingKeys.length === 0) {
    const minNeeded = estimatedCredits * CREDIT_VALUE_CENTS;
    if (!hasEntitlement && creditBalance >= minNeeded) {
      return NextResponse.json({
        canRun: true,
        mode: "credits" as RunMode,
        missingKeys: [],
        missingConnectors: [],
        missingInputs,
        estimatedCostCents,
        estimatedCredits,
        creditBalance,
        freeRunsRemaining,
      } satisfies PreflightResult);
    }

    if (isFree && freeRunsRemaining > 0) {
      return NextResponse.json({
        canRun: true,
        mode: "free_quota" as RunMode,
        missingKeys: [],
        missingConnectors: [],
        missingInputs,
        estimatedCostCents,
        estimatedCredits,
        creditBalance,
        freeRunsRemaining,
      } satisfies PreflightResult);
    }

    if (hasEntitlement) {
      return NextResponse.json({
        canRun: true,
        mode: "credits" as RunMode,
        missingKeys: [],
        missingConnectors: [],
        missingInputs,
        estimatedCostCents,
        estimatedCredits,
        creditBalance,
        freeRunsRemaining,
      } satisfies PreflightResult);
    }
  }

  // Bloqué
  let reason = "Clé API manquante et crédits insuffisants";
  if (missingKeys.length > 0) {
    reason = `Clé(s) manquante(s) : ${missingKeys.join(", ")} — configurez vos clés ou rechargez des crédits`;
  } else if (creditBalance < estimatedCredits * CREDIT_VALUE_CENTS) {
    reason = `Crédits insuffisants (≈ ${estimatedCredits} crédits requis, solde : ${Math.floor(creditBalance / CREDIT_VALUE_CENTS)})`;
  }

  return NextResponse.json({
    canRun: false,
    mode: "blocked" as RunMode,
    missingKeys,
    missingConnectors: [],
    missingInputs,
    estimatedCostCents,
    estimatedCredits,
    creditBalance,
    freeRunsRemaining,
    reason,
  } satisfies PreflightResult);
}
