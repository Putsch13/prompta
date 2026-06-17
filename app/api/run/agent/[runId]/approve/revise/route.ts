import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBuilderApiKey } from "@/lib/builder/api-key";
import { builderRateLimit } from "@/lib/builder/rate-limit";
import { callModel } from "@/lib/llm/gateway";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * « Demander à l'IA de corriger » pendant une validation humaine.
 * Réécrit le contenu proposé par l'agent selon l'instruction de l'utilisateur,
 * SANS valider l'étape : le texte révisé revient dans la modale, l'humain
 * décide ensuite d'approuver ou non.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { runId: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const limited = await builderRateLimit(user.id);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as {
    approvalId?: string;
    instruction?: string;
    content?: string;
    modelId?: string;
  };
  if (!body.approvalId || !body.instruction?.trim()) {
    return NextResponse.json({ error: "approvalId et instruction requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: approval } = await admin
    .from("agent_approvals")
    .select("id, run_id, payload, status")
    .eq("id", body.approvalId)
    .single();
  if (!approval || approval.run_id !== params.runId) {
    return NextResponse.json({ error: "Approbation introuvable" }, { status: 404 });
  }
  if (approval.status !== "pending") {
    return NextResponse.json({ error: "Approbation déjà traitée" }, { status: 409 });
  }

  const { data: run } = await admin
    .from("listing_agent_runs")
    .select("user_id")
    .eq("id", params.runId)
    .single();
  if (!run || run.user_id !== user.id) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const payload = (approval.payload ?? {}) as { preview?: string; label?: string };
  const current = body.content?.trim() || payload.preview || "";

  const keyResult = await getBuilderApiKey(user.id, body.modelId ?? "gpt-5.4-mini");
  if (!keyResult.ok) {
    return NextResponse.json({ error: keyResult.error }, { status: 503 });
  }

  try {
    const result = await callModel({
      provider: keyResult.resolved.provider,
      model: keyResult.resolved.apiModel,
      messages: [
        {
          role: "system",
          content:
            "Tu révises le contenu qu'un agent s'apprête à utiliser, selon l'instruction de l'utilisateur. " +
            "Renvoie UNIQUEMENT le contenu révisé, sans préambule, sans guillemets, sans markdown de bloc. " +
            "Conserve le format d'origine (email, message, texte…). N'invente aucune donnée factuelle (adresses, montants, identifiants).",
        },
        {
          role: "user",
          content: `Contenu actuel :\n"""\n${current}\n"""\n\nInstruction : ${body.instruction.trim()}\n\nContenu révisé :`,
        },
      ],
      apiKey: keyResult.apiKey,
      maxTokens: 2000,
      tokenParam: keyResult.resolved.tokenParam,
    });
    const revised = result.content.trim();
    if (!revised) {
      return NextResponse.json({ error: "L'IA n'a pas pu réviser le contenu." }, { status: 500 });
    }
    return NextResponse.json({ revised });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Échec de la révision IA" },
      { status: 500 },
    );
  }
}
