import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("stripe_accounts")
    .select("stripe_account_id")
    .eq("profile_id", user.id)
    .single();

  let accountId: string;

  if (existing) {
    accountId = existing.stripe_account_id;
  } else {
    const account = await getStripe().accounts.create({
      type: "express",
      metadata: { prompta_user_id: user.id },
    });
    accountId = account.id;

    await supabase.from("stripe_accounts").insert({
      profile_id: user.id,
      stripe_account_id: accountId,
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const accountLink = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/dashboard/payouts`,
    return_url: `${appUrl}/dashboard/payouts?connected=true`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
