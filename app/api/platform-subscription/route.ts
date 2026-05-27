import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: sub } = await supabase
    .from("platform_subscriptions")
    .select("status, plan, current_period_end, cancel_at_period_end, cancel_requested_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ subscription: sub });
}
