import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRunHealthStats } from "@/lib/worker/reap-stale-runs";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }

  const stats = await getRunHealthStats();

  return NextResponse.json({
    ok: stats.staleRuns === 0,
    ...stats,
    workerEnv: {
      composio: !!process.env.COMPOSIO_API_KEY,
      platformOpenAI: !!process.env.PLATFORM_OPENAI_KEY,
      platformAnthropic: !!process.env.PLATFORM_ANTHROPIC_KEY,
      e2b: !!process.env.E2B_API_KEY,
      serper: !!process.env.PLATFORM_SERPER_KEY,
      anthropicAdmin: !!process.env.ANTHROPIC_API_KEY,
    },
  });
}
