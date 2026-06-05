import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listUserConnections } from "@/lib/connections";
import { testComposioConnection } from "@/lib/composio/execute";
import { isComposioEnabled } from "@/lib/composio/client";
import { connectorLookupIds } from "@/lib/connectors/resolve-id";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const connectorId = params.id;

  if (isComposioEnabled()) {
    const result = await testComposioConnection(user.id, connectorId);
    return NextResponse.json({
      connected: result.connected,
      account: result.accountId,
    });
  }

  const lookupIds = new Set(connectorLookupIds(connectorId));
  const connections = await listUserConnections(user.id);
  const match = connections.find(
    (c) => lookupIds.has(c.connectorId) && c.status === "connected",
  );
  if (!match) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    account: match.accountEmail ?? match.accountName ?? match.workspaceName ?? undefined,
  });
}
