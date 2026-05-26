import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveUserConnectionApiKey } from "@/lib/connections";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const connectorId = body.connectorId as string;
  const apiKey = body.apiKey as string;

  if (!connectorId || !apiKey?.trim()) {
    return NextResponse.json({ error: "connectorId et apiKey requis" }, { status: 400 });
  }

  await saveUserConnectionApiKey(user.id, connectorId, apiKey.trim());
  return NextResponse.json({ ok: true });
}
