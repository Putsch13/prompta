import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ runId: string; deliverableId: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: deliverable } = await admin
    .from("agent_deliverables")
    .select("*")
    .eq("id", params.deliverableId)
    .eq("run_id", params.runId)
    .eq("user_id", user.id)
    .single();

  if (!deliverable) {
    return NextResponse.json({ error: "Livrable introuvable" }, { status: 404 });
  }

  if (deliverable.content_text !== null) {
    return new NextResponse(deliverable.content_text, {
      status: 200,
      headers: {
        "Content-Type": deliverable.mime_type,
        "Content-Disposition": `attachment; filename="${deliverable.filename}"`,
      },
    });
  }

  if (deliverable.storage_path) {
    const { data: signedUrlData, error: signError } = await admin.storage
      .from("agent-deliverables")
      .createSignedUrl(deliverable.storage_path, 60);

    if (signError || !signedUrlData?.signedUrl) {
      return NextResponse.json(
        { error: "Impossible de générer l'URL de téléchargement" },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signedUrlData.signedUrl);
  }

  return NextResponse.json({ error: "Aucun contenu disponible" }, { status: 404 });
}
