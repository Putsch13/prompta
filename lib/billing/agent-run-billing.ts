import type { AgentManifest } from "@/lib/agent/schema";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { getUserKey, type KeyProvider } from "@/lib/keys";
import { getCreditBalance, holdCreditsForRun, settleCreditsForRun, releaseCreditHold } from "@/lib/credits";
import { checkMonthlySpendCap } from "@/lib/billing/spending-limits";
import { costToCredits, CREDIT_VALUE_CENTS, FREE_TIER_MODEL } from "@/lib/billing/credits";
import { applyFreeTierLimits, decidePlatformRunBilling } from "@/lib/billing/free-tier";
import { estimateMaxCostForManifest } from "@/lib/billing/estimate-manifest-cost";
import { getCreditCircuitStatus } from "@/lib/billing/circuit-breaker";
import { consumeFreeRunQuota } from "@/lib/billing/free-quota";
import { isUnrestrictedUser } from "@/lib/auth/privileges";

const PROVIDERS: KeyProvider[] = ["openai", "anthropic", "google", "mistral", "serper"];

export interface ResolvedRunKeys {
  apiKeys: Record<string, string>;
  /**
   * Fournisseurs de `apiKeys` servis par une clé PLATEFORME (les autres sont
   * BYOK). À passer à l'orchestrateur : seuls les steps exécutés sur ces
   * fournisseurs sont facturables en crédits au settle.
   */
  platformProviders: string[];
  usedCredits: boolean;
  usedFreeQuota: boolean;
  estimatedMax: number;
  /**
   * Manifeste EFFECTIF à exécuter : bridé free-tier (modèle imposé) quand le
   * run passe sur quota gratuit, identique au manifeste fourni sinon. Les
   * appelants doivent exécuter CE manifeste, pas celui d'origine.
   */
  manifest: AgentManifest;
}

/** Charge les clés BYOK ou plateforme ; indique si le run consommera des crédits. */
export async function resolveAgentRunKeys(
  userId: string,
  manifest: AgentManifest,
  hasEntitlement: boolean,
  isFree: boolean,
  options?: { consumeFreeQuota?: boolean }
): Promise<ResolvedRunKeys> {
  if (await isUnrestrictedUser(userId)) {
    const apiKeys: Record<string, string> = {};
    const platformProviders: string[] = [];
    for (const p of PROVIDERS) {
      const key = await getUserKey(userId, p);
      if (key) apiKeys[p] = key;
    }
    for (const step of manifest.steps) {
      if (step.type !== "llm") continue;
      const { provider } = resolveModelOrDefault(step.model);
      if (!apiKeys[provider]) {
        const platformKey = process.env[`PLATFORM_${provider.toUpperCase()}_KEY`];
        if (platformKey) {
          apiKeys[provider] = platformKey;
          platformProviders.push(provider);
        }
      }
    }
    if (
      manifest.steps.some((s) => s.type === "tool" && s.tool === "web_search") &&
      !apiKeys.serper &&
      process.env.PLATFORM_SERPER_KEY
    ) {
      apiKeys.serper = process.env.PLATFORM_SERPER_KEY;
      platformProviders.push("serper");
    }
    return { apiKeys, platformProviders, usedCredits: false, usedFreeQuota: false, estimatedMax: 0, manifest };
  }

  const consumeQuota = options?.consumeFreeQuota !== false;
  const apiKeys: Record<string, string> = {};
  const platformProviders: string[] = [];
  let usedCredits = false;
  let usedFreeQuota = false;
  let needsPlatformKeys = false;

  for (const p of PROVIDERS) {
    const key = await getUserKey(userId, p);
    if (key) apiKeys[p] = key;
  }

  for (const step of manifest.steps) {
    if (step.type !== "llm") continue;
    const { provider } = resolveModelOrDefault(step.model);
    if (apiKeys[provider]) continue;

    const platformKey = process.env[`PLATFORM_${provider.toUpperCase()}_KEY`];
    if (!platformKey) continue;

    apiKeys[provider] = platformKey;
    platformProviders.push(provider);
    needsPlatformKeys = true;
  }

  if (
    manifest.steps.some((s) => s.type === "tool" && s.tool === "web_search") &&
    !apiKeys.serper
  ) {
    const serper = process.env.PLATFORM_SERPER_KEY;
    if (serper) {
      apiKeys.serper = serper;
      platformProviders.push("serper");
      needsPlatformKeys = true;
    }
  }

  const estimatedMax = estimateMaxCostForManifest(manifest);

  if (needsPlatformKeys && !hasEntitlement) {
    const balance = await getCreditBalance(userId);
    const decision = decidePlatformRunBilling({
      balanceCents: balance,
      minCreditsCents: costToCredits(estimatedMax) * CREDIT_VALUE_CENTS,
      listingIsFree: isFree,
    });

    if (decision === "credits") {
      usedCredits = true;
    } else if (decision === "free_quota") {
      if (consumeQuota) {
        const allowed = await consumeFreeRunQuota(userId);
        if (!allowed) {
          throw new Error(
            "Quota gratuit atteint — rechargez des crédits ou configurez vos clés BYOK."
          );
        }
      }
      usedFreeQuota = true;
    } else {
      throw new Error("Crédits insuffisants — rechargez ou configurez vos clés BYOK.");
    }
  }

  if (usedCredits) {
    const circuit = await getCreditCircuitStatus();
    if (!circuit.allowed) {
      throw new Error(circuit.reason ?? "Mode crédits temporairement suspendu.");
    }

    const cap = await checkMonthlySpendCap(userId, estimatedMax);
    if (!cap.allowed) {
      throw new Error(cap.message ?? "Plafond mensuel atteint");
    }

    const balance = await getCreditBalance(userId);
    const minNeeded = costToCredits(estimatedMax) * CREDIT_VALUE_CENTS;
    if (balance < minNeeded) {
      throw new Error("Crédits insuffisants — rechargez ou configurez vos clés BYOK.");
    }
  }

  // Quota gratuit = modèle bridé : tous les appels LLM du manifeste basculent
  // sur FREE_TIER_MODEL (le plafond de tokens PAR APPEL est appliqué par
  // l'orchestrateur via llmMaxTokensCap). On garantit la clé plateforme du
  // provider free-tier, absente si le manifeste d'origine ne l'utilisait pas.
  let effectiveManifest = manifest;
  if (usedFreeQuota) {
    effectiveManifest = applyFreeTierLimits(manifest);
    const freeProvider = resolveModelOrDefault(FREE_TIER_MODEL).provider;
    if (!apiKeys[freeProvider]) {
      const platformKey = process.env[`PLATFORM_${freeProvider.toUpperCase()}_KEY`];
      if (platformKey) {
        apiKeys[freeProvider] = platformKey;
        platformProviders.push(freeProvider);
      }
    }
  }

  return { apiKeys, platformProviders, usedCredits, usedFreeQuota, estimatedMax, manifest: effectiveManifest };
}

export async function holdAgentRunCredits(
  userId: string,
  runId: string,
  estimatedMax: number
): Promise<boolean> {
  // run_type "agent" obligatoire : la RPC écrit sinon l'UUID dans
  // prompt_run_id (FK → runs) et échoue pour un run agent — et le settle,
  // lui, trace déjà "agent" (incohérence hold/settle).
  return holdCreditsForRun(userId, estimatedMax, runId, "agent");
}

export async function releaseAgentRunCredits(
  userId: string,
  runId: string,
  estimatedMax: number
): Promise<void> {
  await releaseCreditHold(userId, estimatedMax, runId, "agent");
}

export async function settleAgentRunCredits(
  userId: string,
  runId: string,
  usage: { steps: import("@/lib/agent/orchestrator").StepUsage[] },
  estimatedMax: number
): Promise<void> {
  const { computeRunCost } = await import("@/lib/billing/run-cost");
  const actual = computeRunCost(usage);
  await settleCreditsForRun(userId, actual, estimatedMax, runId, "agent");
}
