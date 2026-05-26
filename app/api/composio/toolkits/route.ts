import { NextResponse } from "next/server";
import { isComposioEnabled } from "@/lib/composio/client";
import { listComposioToolkits } from "@/lib/composio/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
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
