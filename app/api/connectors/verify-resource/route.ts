import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyResourceAccess } from "@/lib/connectors/verify-resource";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { connector, resourceType, value } = body as {
    connector?: string;
    resourceType?: string;
    value?: string;
  };
  if (!connector || !resourceType || !value) {
    return NextResponse.json({ status: "inconclusive" });
  }

  try {
    const result = await verifyResourceAccess({
      userId: user.id,
      connectorId: connector,
      resourceType,
      value,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ status: "inconclusive" });
  }
}
