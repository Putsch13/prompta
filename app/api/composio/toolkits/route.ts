import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isComposioEnabled } from "@/lib/composio/client";
import { listComposioToolkits } from "@/lib/composio/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (!isComposioEnabled()) {
    return NextResponse.json({ enabled: false, toolkits: [] });
  }
  try {
    const toolkits = await listComposioToolkits();
    return NextResponse.json({ enabled: true, toolkits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Composio";
    return NextResponse.json({ enabled: true, error: message, toolkits: [] }, { status: 502 });
  }
}
