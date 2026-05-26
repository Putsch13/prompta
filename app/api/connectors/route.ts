import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listUserConnections } from "@/lib/connections";
import { listUserKeys } from "@/lib/keys";
import { CONNECTORS } from "@/lib/connectors/registry";
import { isComposioEnabled } from "@/lib/composio/client";
import { syncComposioConnections } from "@/lib/composio/connect";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  if (isComposioEnabled()) {
    try {
      await syncComposioConnections(user.id);
    } catch {
      // sync best-effort
    }
  }

  const [keys, connections] = await Promise.all([
    listUserKeys(user.id),
    listUserConnections(user.id),
  ]);

  return NextResponse.json({
    keys,
    connections,
    composioEnabled: isComposioEnabled(),
    connectors: CONNECTORS.map((c) => ({
      id: c.id,
      label: c.label,
      authType: c.authType,
      category: c.category,
    })),
  });
}
