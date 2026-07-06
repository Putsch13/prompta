import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, publishedAgentCount } from "@/lib/billing/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const [{ data: sub }, planInfo, published] = await Promise.all([
    supabase
      .from("platform_subscriptions")
      .select("status, plan, current_period_end, cancel_at_period_end, cancel_requested_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    getUserPlan(user.id),
    publishedAgentCount(user.id),
  ]);

  return NextResponse.json({
    subscription: sub,
    plan: {
      id: planInfo.planId,
      label: planInfo.plan.label,
      priceCents: planInfo.plan.priceCents,
      publishedAgentLimit: planInfo.plan.publishedAgentLimit,
      monthlyCreditCents: planInfo.plan.monthlyCreditCents,
      unrestricted: planInfo.unrestricted,
      cancelAtPeriodEnd: planInfo.cancelAtPeriodEnd,
      currentPeriodEnd: planInfo.currentPeriodEnd,
    },
    usage: { publishedAgents: published },
  });
}
