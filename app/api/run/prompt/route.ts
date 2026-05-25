import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callModel } from "@/lib/llm/gateway";
import { getUserKey, providerForModel, invalidateKey } from "@/lib/keys";
import { estimateCost } from "@/lib/llm/providers";
import type { LLMProvider } from "@/lib/llm/providers";
import { getCreditBalance, debitCreditsForRun, RUN_CREDIT_COST_CENTS } from "@/lib/credits";
import { hasPlatformPro } from "@/lib/platform-access";
import { trackProRun } from "@/lib/revshare";

export const dynamic = "force-dynamic";

const FREE_RUN_LIMIT = 20;

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function checkFreeQuota(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: quota } = await supabase
    .from("free_run_quota")
    .select("runs_today, last_reset")
    .eq("user_id", userId)
    .maybeSingle();

  if (!quota) {
    await supabase.from("free_run_quota").insert({ user_id: userId, runs_today: 1, last_reset: today });
    return true;
  }

  if (quota.last_reset !== today) {
    await supabase
      .from("free_run_quota")
      .update({ runs_today: 1, last_reset: today })
      .eq("user_id", userId);
    return true;
  }

  if (quota.runs_today >= FREE_RUN_LIMIT) return false;

  await supabase
    .from("free_run_quota")
    .update({ runs_today: quota.runs_today + 1 })
    .eq("user_id", userId);

  return true;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
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

    if (!purchase && !subscription) {
      return new Response(JSON.stringify({ error: "Accès non autorisé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const { data: version } = await admin
    .from("listing_versions")
    .select("prompt_body")
    .eq("id", versionId)
    .single();

  if (!version?.prompt_body) {
    return new Response(JSON.stringify({ error: "Prompt introuvable" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provider = providerForModel(model) as LLMProvider;
  let apiKey = await getUserKey(user.id, provider);
  let usedCredits = false;

  if (!apiKey) {
    apiKey = process.env[`PLATFORM_${provider.toUpperCase()}_KEY`] ?? null;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "configure_keys", message: "Configurez vos clés API pour lancer ce prompt" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const creditBalance = await getCreditBalance(user.id);
    if (creditBalance >= RUN_CREDIT_COST_CENTS) {
      usedCredits = true;
    } else if (isFree) {
      const allowed = await checkFreeQuota(user.id);
      if (!allowed) {
        return new Response(
          JSON.stringify({
            error: "quota_exceeded",
            message: "Quota gratuit atteint — achetez des crédits ou configurez vos clés",
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    } else if (!isPro) {
      return new Response(
        JSON.stringify({ error: "configure_keys", message: "Configurez vos clés API ou souscrivez à Prompta Pro" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const prompt = interpolate(version.prompt_body, variables);

  const { data: run } = await admin
    .from("runs")
    .insert({
      user_id: user.id,
      listing_id: listingId,
      version_id: versionId,
      model,
      provider,
      status: "running",
    })
    .select("id")
    .single();

  if (usedCredits && run?.id) {
    const debited = await debitCreditsForRun(user.id, run.id);
    if (!debited) {
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
          model,
          messages: [{ role: "user", content: prompt }],
          apiKey,
          maxTokens: 4096,
        });

        const cost = estimateCost(model, result.inputTokens, result.outputTokens);

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
