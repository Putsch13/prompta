import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserKey } from "@/lib/keys";
import { generateAgentPlan } from "@/lib/builder/generate-agent-plan";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { description } = body as { description?: string };

  if (!description || description.trim().length < 10) {
    return NextResponse.json(
      { error: "Décrivez votre objectif en au moins 10 caractères." },
      { status: 400 }
    );
  }

  let apiKey = await getUserKey(user.id, "openai");
  if (!apiKey) {
    apiKey = process.env.PLATFORM_OPENAI_KEY ?? null;
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé OpenAI requise (BYOK ou plateforme) pour la génération de plan." },
      { status: 503 }
    );
  }

  try {
    const plan = await generateAgentPlan(description.trim(), apiKey);
    return NextResponse.json({ plan });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur génération plan" },
      { status: 500 }
    );
  }
}
