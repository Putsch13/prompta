import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { testComposioConnection } from "@/lib/composio/execute";
import { isComposioEnabled } from "@/lib/composio/client";
import { getUserConnection } from "@/lib/connections";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, props: Params) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const connectorId = params.id;

  if (isComposioEnabled()) {
    const result = await testComposioConnection(user.id, connectorId);
    return NextResponse.json(result);
  }

  const conn = await getUserConnection(user.id, connectorId);
  return NextResponse.json({
    connected: !!conn,
    provider: "native" as const,
    error: conn ? undefined : `Connectez ${connectorId} d'abord`,
  });
}
