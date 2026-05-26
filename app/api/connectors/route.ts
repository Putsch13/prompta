import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listUserConnections } from "@/lib/connections";
import { listUserKeys } from "@/lib/keys";
import { CONNECTORS } from "@/lib/connectors/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const [keys, connections] = await Promise.all([
    listUserKeys(user.id),
    listUserConnections(user.id),
  ]);

  return NextResponse.json({
    keys,
    connections,
    connectors: CONNECTORS.map((c) => ({
      id: c.id,
      label: c.label,
      authType: c.authType,
      category: c.category,
    })),
  });
}
