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

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, status, current_period_end, listing:listings(title, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ subscriptions: subscriptions ?? [] });
}
