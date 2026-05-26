import { NextRequest, NextResponse } from "next/server";
import { isComposioEnabled } from "@/lib/composio/client";
import { listComposioTools } from "@/lib/composio/catalog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const toolkit = req.nextUrl.searchParams.get("toolkit");
  if (!toolkit) {
    return NextResponse.json({ error: "Paramètre toolkit requis" }, { status: 400 });
  }
  if (!isComposioEnabled()) {
    return NextResponse.json({ enabled: false, tools: [] });
  }
  try {
    const tools = await listComposioTools(toolkit);
    return NextResponse.json({ enabled: true, tools });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Composio";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
