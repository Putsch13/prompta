import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callModel } from "@/lib/llm/gateway";
import { getUserKey, invalidateKey } from "@/lib/keys";
import { computeRunCost, estimateMaxCost } from "@/lib/billing/run-cost";
import { resolveModelOrDefault } from "@/lib/llm/resolve-model";
import {
  getCreditBalance,
  holdCreditsForRun,
  settleCreditsForRun,
  releaseCreditHold,
} from "@/lib/credits";
import {
  costToCredits,
  CREDIT_VALUE_CENTS,
  FREE_TIER_MODEL,
  FREE_RUN_MAX_TOKENS,
} from "@/lib/billing/credits";
import { consumeFreeRunQuota } from "@/lib/billing/free-quota";
import { getCreditCircuitStatus } from "@/lib/billing/circuit-breaker";
import { getCachedRun, runCacheKey, setCachedRun } from "@/lib/billing/run-cache";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import { isUnrestrictedUser } from "@/lib/auth/privileges";
import { hasPlatformPro } from "@/lib/platform-access";
import { trackProRun } from "@/lib/revshare";

export const dynamic = "force-dynamic";

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const unrestricted = await isUnrestrictedUser(user.id);
  if (!unrestricted) {
    const rate = checkRateLimit(`run:prompt:${user.id}`, RATE_LIMITS.run);
    if (!rate.success) {
      return rateLimitResponse(rate.resetAt);
    }
  }

  const body = await request.json();
  const { listingId, versionId, model, variables = {} } = body as {
    listingId: string;
    versionId: string;
    model: string;
    variables?: Record<string, string>;
  };

  const admin = createAdminClient();

  const { data: listing } = await admin
    .from("listings")
    .select("id, title, price_cents, creator_id, status, type")
    .eq("id", listingId)
    .eq("status", "published")
    .single();

  if (!listing) {
    return new Response(JSON.stringify({ error: "Listing introuvable" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isOwner = listing.creator_id === user.id;
  const isFree = listing.price_cents === 0;
  const isPro = await hasPlatformPro(user.id);

  let hasPurchase = false;
  let hasSubscription = false;

  if (!isFree && !isOwner && !isPro) {
    const { data: purchase } = await admin
      .from("purchases")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("listing_id", listingId)
      .eq("status", "completed")
      .maybeSingle();

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("listing_id", listingId)
      .eq("status", "active")
      .maybeSingle();

    hasPurchase = !!purchase;
    hasSubscription = !!subscription;

    if (!hasPurchase && !hasSubscription) {
      return new Response(JSON.stringify({ error: "Accès non autorisé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const hasEntitlement = isOwner || isPro || hasPurchase || hasSubscription;

  // La version DOIT appartenir au listing contrôlé plus haut (sinon IDOR :
  // exécuter le prompt d'un autre listing via son versionId).
  const { data: version } = await admin
    .from("listing_versions")
    .select("prompt_body")
    .eq("id", versionId)
    .eq("listing_id", listingId)
    .single();

  if (!version?.prompt_body) {
    return new Response(JSON.stringify({ error: "Prompt introuvable" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let resolved = resolveModelOrDefault(model);
  let { provider, apiModel, tokenParam } = resolved;
  let apiKey = await getUserKey(user.id, provider);
  let usedCredits = false;
  let usedFreeQuota = false;

  const estimatedMax = estimateMaxCost({ stepCount: 1, maxTokens: 4096, maxToolCalls: 0 });
  const estimatedCredits = costToCredits(estimatedMax);

  if (!apiKey) {
    apiKey = process.env[`PLATFORM_${provider.toUpperCase()}_KEY`] ?? null;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "configure_keys", message: "Configurez vos clés API pour lancer ce prompt" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!unrestricted) {
      const creditBalance = await getCreditBalance(user.id);
      const minCreditsCents = estimatedCredits * CREDIT_VALUE_CENTS;

      if (!hasEntitlement && creditBalance >= minCreditsCents) {
        const circuit = await getCreditCircuitStatus();
        if (!circuit.allowed) {
          return new Response(
            JSON.stringify({ error: "circuit_breaker", message: circuit.reason }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
        usedCredits = true;
      } else if (isFree && !hasEntitlement) {
        const allowed = await consumeFreeRunQuota(user.id);
        if (!allowed) {
          return new Response(
            JSON.stringify({
              error: "quota_exceeded",
              message: "Quota gratuit atteint — achetez des crédits ou configurez vos clés",
            }),
            { status: 429, headers: { "Content-Type": "application/json" } }
          );
        }
        usedFreeQuota = true;
        resolved = resolveModelOrDefault(FREE_TIER_MODEL);
        provider = resolved.provider;
        apiModel = resolved.apiModel;
        tokenParam = resolved.tokenParam;
        apiKey = process.env[`PLATFORM_${provider.toUpperCase()}_KEY`] ?? apiKey;
      } else if (!hasEntitlement) {
        return new Response(
          JSON.stringify({
            error: "insufficient_credits",
            message: `Crédits insuffisants (≈ ${estimatedCredits} crédits requis)`,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  const prompt = interpolate(version.prompt_body, variables);
  const maxTokens = usedFreeQuota ? FREE_RUN_MAX_TOKENS : 4096;

  const cacheKey = usedCredits
    ? runCacheKey({ prompt, model: apiModel, maxTokens })
    : null;

  if (cacheKey) {
    const cached = getCachedRun(cacheKey);
    if (cached) {
      const { data: run } = await admin
        .from("runs")
        .insert({
          user_id: user.id,
          listing_id: listingId,
          version_id: versionId,
          model: usedFreeQuota ? FREE_TIER_MODEL : model,
          provider,
          status: "completed",
          output: cached.output,
          cost_estimate: cached.costCents,
        })
        .select("id")
        .single();

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", runId: run?.id, tokens: 0, cost: cached.costCents, cached: true })}\n\n`
            )
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }
  }

  const { data: run } = await admin
    .from("runs")
    .insert({
      user_id: user.id,
      listing_id: listingId,
      version_id: versionId,
      model: usedFreeQuota ? FREE_TIER_MODEL : model,
      provider,
      status: "running",
    })
    .select("id")
    .single();

  if (usedCredits && run?.id) {
    const held = await holdCreditsForRun(user.id, estimatedMax, run.id);
    if (!held) {
      await admin.from("runs").update({ status: "failed", error_message: "Crédits insuffisants" }).eq("id", run.id);
      return new Response(JSON.stringify({ error: "insufficient_credits" }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await callModel({
          provider,
          model: apiModel,
          messages: [{ role: "user", content: prompt }],
          apiKey,
          maxTokens,
          tokenParam,
        });

        const cost = computeRunCost({
          steps: [{ inputTokens: result.inputTokens, outputTokens: result.outputTokens, model: apiModel }],
        });

        if (usedCredits && run?.id) {
          await settleCreditsForRun(user.id, cost, estimatedMax, run.id, "prompt");
          if (cacheKey) setCachedRun(cacheKey, result.content, cost);
        }

        await admin
          .from("runs")
          .update({
            status: "completed",
            output: result.content,
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
            cost_estimate: cost,
          })
          .eq("id", run?.id ?? "");

        if (isPro && !isOwner && listing.creator_id) {
          await trackProRun(listingId, listing.creator_id).catch(() => undefined);
        }

        const chunks = result.content.match(/.{1,30}/g) ?? [result.content];
        for (const chunk of chunks) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`)
          );
          await new Promise((r) => setTimeout(r, 5));
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", runId: run?.id, tokens: result.inputTokens + result.outputTokens, cost })}\n\n`
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erreur";
        if (message.includes("401") || message.includes("auth")) {
          await invalidateKey(user.id, provider);
        }
        if (usedCredits && run?.id) {
          await releaseCreditHold(user.id, estimatedMax, run.id).catch(() => undefined);
        }
        await admin
          .from("runs")
          .update({ status: "failed", error_message: message })
          .eq("id", run?.id ?? "");

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
