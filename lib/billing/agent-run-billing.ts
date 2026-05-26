import type { AgentManifest } from "@/lib/agent/schema";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import { getUserKey, type KeyProvider } from "@/lib/keys";
import { getCreditBalance, holdCreditsForRun, settleCreditsForRun, releaseCreditHold } from "@/lib/credits";
import { checkMonthlySpendCap } from "@/lib/billing/spending-limits";
import { costToCredits, CREDIT_VALUE_CENTS } from "@/lib/billing/credits";
import { estimateMaxCostForManifest } from "@/lib/billing/estimate-manifest-cost";
import { getCreditCircuitStatus } from "@/lib/billing/circuit-breaker";
import { consumeFreeRunQuota } from "@/lib/billing/free-quota";
import { isUnrestrictedUser } from "@/lib/auth/privileges";

const PROVIDERS: KeyProvider[] = ["openai", "anthropic", "google", "mistral", "serper"];

export interface ResolvedRunKeys {
  apiKeys: Record<string, string>;
  usedCredits: boolean;
  usedFreeQuota: boolean;
  estimatedMax: number;
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
    for (const p of PROVIDERS) {
      const key = await getUserKey(userId, p);
      if (key) apiKeys[p] = key;
    }
    for (const step of manifest.steps) {
      if (step.type !== "llm") continue;
      const { provider } = resolveModelOrDefault(step.model);
      if (!apiKeys[provider]) {
        const platformKey = process.env[`PLATFORM_${provider.toUpperCase()}_KEY`];
        if (platformKey) apiKeys[provider] = platformKey;
      }
    }
    if (
      manifest.steps.some((s) => s.type === "tool" && s.tool === "web_search") &&
      !apiKeys.serper &&
      process.env.PLATFORM_SERPER_KEY
    ) {
      apiKeys.serper = process.env.PLATFORM_SERPER_KEY;
    }
    return { apiKeys, usedCredits: false, usedFreeQuota: false, estimatedMax: 0 };
  }

  const consumeQuota = options?.consumeFreeQuota !== false;
  const apiKeys: Record<string, string> = {};
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
    needsPlatformKeys = true;
  }

  if (
    manifest.steps.some((s) => s.type === "tool" && s.tool === "web_search") &&
    !apiKeys.serper
  ) {
    const serper = process.env.PLATFORM_SERPER_KEY;
    if (serper) {
      apiKeys.serper = serper;
      needsPlatformKeys = true;
    }
  }

  const estimatedMax = estimateMaxCostForManifest(manifest);

  if (needsPlatformKeys && !hasEntitlement) {
    const balance = await getCreditBalance(userId);
    const minNeeded = costToCredits(estimatedMax) * CREDIT_VALUE_CENTS;

    if (balance >= minNeeded) {
      usedCredits = true;
    } else if (isFree) {
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

  return { apiKeys, usedCredits, usedFreeQuota, estimatedMax };
}

export async function holdAgentRunCredits(
  userId: string,
  runId: string,
  estimatedMax: number
): Promise<boolean> {
  return holdCreditsForRun(userId, estimatedMax, runId);
}

export async function releaseAgentRunCredits(
  userId: string,
  runId: string,
  estimatedMax: number
): Promise<void> {
  await releaseCreditHold(userId, estimatedMax, runId);
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
