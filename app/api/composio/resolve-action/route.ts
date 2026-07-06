import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveComposioToolSlug } from "@/lib/composio/resolve-native-action";
import { listComposioTools } from "@/lib/composio/catalog";
import { toComposioToolkitSlug } from "@/lib/connectors/resolve-id";

export const dynamic = "force-dynamic";

/**
 * Résout une action « inventée » (ex. google_drive.read_file) vers le vrai
 * outil Composio + son schéma d'entrées, pour enrichir le graphe à la conception.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const connector = (searchParams.get("connector") ?? "").trim();
  const action = (searchParams.get("action") ?? "").trim();
  if (!connector || !action) {
    return NextResponse.json({ error: "connector et action requis" }, { status: 400 });
  }

  try {
    const slug = await resolveComposioToolSlug(connector, action);
    if (!slug) return NextResponse.json({ slug: null });
    const toolkit = toComposioToolkitSlug(connector);
    const tools = await listComposioTools(toolkit);
    const tool = tools.find((t) => t.slug === slug);
    // On expose defaultValue/enumValues/maxLength du schéma pour que le builder
    // pré-remplisse les requis triviaux (ex. design_type) dès la conception.
    return NextResponse.json({
      slug,
      name: tool?.name ?? slug,
      inputs: tool?.inputs ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur résolution action" },
      { status: 500 },
    );
  }
}
