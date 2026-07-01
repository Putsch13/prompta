import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBuilderApiKey } from "@/lib/builder/api-key";
import { builderRateLimit } from "@/lib/builder/rate-limit";
import { editAgentPlan } from "@/lib/builder/edit-agent-plan";
import { parseGeneratedAgentPlan } from "@/lib/builder/generate-agent-plan";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const limited = await builderRateLimit(user.id);
  if (limited) return limited;

  const body = await request.json();
  const { plan, instruction, modelId } = body as {
    plan?: unknown;
    instruction?: string;
    modelId?: string;
  };

  if (!instruction || instruction.trim().length < 3) {
    return NextResponse.json(
      { error: "Instruction trop courte (min. 3 caractères)." },
      { status: 400 },
    );
  }

  let parsedPlan;
  try {
    parsedPlan = parseGeneratedAgentPlan(plan);
  } catch {
    return NextResponse.json({ error: "Plan invalide." }, { status: 400 });
  }

  const keyResult = await getBuilderApiKey(user.id, modelId ?? "gpt-5.4-mini");
  if (!keyResult.ok) {
    return NextResponse.json({ error: keyResult.error }, { status: 503 });
  }

  try {
    const result = await editAgentPlan({
      plan: parsedPlan,
      instruction: instruction.trim(),
      apiKey: keyResult.apiKey,
      resolved: keyResult.resolved,
    });
    return NextResponse.json({
      plan: result.plan,
      changedIds: result.changedIds,
      model: keyResult.resolved.catalogId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur édition plan" },
      { status: 500 },
    );
  }
}
