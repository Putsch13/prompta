import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listConnectorResources, NeedsConnectionError } from "@/lib/connectors/list-resources";
import { getResourceType } from "@/lib/connectors/resource-types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const resourceType = request.nextUrl.searchParams.get("resourceType");
  const parent = request.nextUrl.searchParams.get("parent") ?? undefined;
  const q = request.nextUrl.searchParams.get("q") ?? undefined;

  if (!resourceType) {
    return NextResponse.json({ error: "resourceType requis" }, { status: 400 });
  }

  const def = getResourceType(resourceType);
  if (!def) {
    return NextResponse.json({ error: "Type de ressource inconnu" }, { status: 400 });
  }

  const connectorId = params.id || def.connectorId;

  try {
    const result = await listConnectorResources({
      userId: user.id,
      connectorId,
      resourceType,
      parent,
      q,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NeedsConnectionError) {
      return NextResponse.json({ needsConnection: err.connectorId }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur listing ressources" },
      { status: 500 },
    );
  }
}
