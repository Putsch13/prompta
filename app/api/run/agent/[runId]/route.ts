import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Props {
  params: { runId: string };
}

export async function GET(_request: Request, { params }: Props) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: run } = await supabase
    .from("listing_agent_runs")
    .select("id, status, steps_completed, output, error_message, created_at")
    .eq("id", params.runId)
    .eq("user_id", user.id)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run introuvable" }, { status: 404 });
  }

  return NextResponse.json({ run });
}
