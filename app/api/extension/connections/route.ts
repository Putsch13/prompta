import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listUserConnections } from "@/lib/connections";

export const dynamic = "force-dynamic";

/** Pastilles de connexion de l'extension : app → utilisable maintenant ou pas. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const connections = await listUserConnections(user.id);
  return NextResponse.json({
    email: user.email ?? null,
    connections: connections.map((c) => ({
      connectorId: c.connectorId,
      usable: c.usable,
      status: c.status,
    })),
  });
}
