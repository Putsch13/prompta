import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { diagnoseConnectorAccess } from "@/lib/connectors/diagnose-access";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const connectorId = params.id;
  if (!connectorId) {
    return NextResponse.json({ error: "Connecteur requis" }, { status: 400 });
  }

  try {
    const result = await diagnoseConnectorAccess(user.id, connectorId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        code: "error",
        message: err instanceof Error ? err.message : "Diagnostic impossible",
      },
      { status: 200 },
    );
  }
}
