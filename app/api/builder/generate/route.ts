import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBuilderApiKey } from "@/lib/builder/api-key";
import { builderRateLimit } from "@/lib/builder/rate-limit";
import { generateAgentSkeleton } from "@/lib/builder/generate-skeleton";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const limited = await builderRateLimit(user.id);
  if (limited) return limited;

  const body = await request.json();
  const { description, modelId } = body as { description?: string; modelId?: string };

  if (!description || description.trim().length < 10) {
    return NextResponse.json(
      { error: "Décrivez votre agent en au moins 10 caractères." },
      { status: 400 }
    );
  }

  const keyResult = await getBuilderApiKey(user.id, modelId ?? "gpt-5.4-mini");
  if (!keyResult.ok) {
    return NextResponse.json(
      { error: keyResult.error },
      { status: 503 }
    );
  }

  try {
    const skeleton = await generateAgentSkeleton(
      description.trim(),
      keyResult.apiKey,
      keyResult.resolved
    );
    return NextResponse.json({ skeleton, model: keyResult.resolved.catalogId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur génération" },
      { status: 500 }
    );
  }
}
