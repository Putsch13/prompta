import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { ORG_PLANS, type OrgPlanKey } from "@/lib/stripe-plans";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { orgSlug, plan } = (await request.json()) as {
    orgSlug: string;
    plan: OrgPlanKey;
  };

  const planConfig = ORG_PLANS[plan];
  if (!planConfig) {
    return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
  }

  const { data: membership } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Réservé aux admins org" }, { status: 403 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: `Prompta ${planConfig.label} — ${org.name}`,
            description: `${planConfig.seats} sièges`,
          },
          unit_amount: planConfig.priceCents,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    automatic_tax: { enabled: true },
    success_url: `${appUrl}/org/${org.slug}?subscribed=1`,
    cancel_url: `${appUrl}/org/${org.slug}`,
    metadata: {
      type: "org_subscription",
      org_id: org.id,
      plan,
      buyer_id: user.id,
    },
    subscription_data: {
      metadata: { type: "org_subscription", org_id: org.id, plan },
    },
  });

  return NextResponse.json({ url: session.url });
}
