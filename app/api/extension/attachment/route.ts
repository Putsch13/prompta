import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { builderRateLimit } from "@/lib/builder/rate-limit";
import { uploadUserDocument, getDocumentText } from "@/lib/documents/user-documents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Pièce jointe du chat (bouton 📎 des 3 fronts).
 *
 * Le fichier est stocké dans les documents de l'utilisateur (bucket
 * `user-documents`, migration 0033) et son texte extrait IMMÉDIATEMENT
 * (officeparser / SheetJS via getDocumentText) : un scan sans texte ou un
 * format illisible est signalé à l'upload, pas au milieu de la mission.
 *
 * Raison d'être : la visionneuse PDF de Chrome n'expose RIEN à l'extension
 * (ni texte ni DOM) — un PDF local était donc invisible pour l'agent, qui
 * partait en pilotage browser sur une page vide. Joindre le fichier rend son
 * texte disponible dans {{file_content}} pour toute la mission.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated", message: "Connectez-vous à Prompta." },
      { status: 401 },
    );
  }

  const limited = await builderRateLimit(user.id);
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "no_file", message: "Aucun fichier reçu." },
      { status: 400 },
    );
  }

  try {
    const doc = await uploadUserDocument(user.id, file);
    // Extraction de contrôle : on veut échouer ICI, avec un message clair,
    // plutôt qu'à l'étape 4 d'une mission.
    const text = await getDocumentText(user.id, doc.id);
    return NextResponse.json({
      id: doc.id,
      name: doc.name,
      chars: text.length,
      excerpt: text.slice(0, 280),
    });
  } catch (e) {
    // uploadUserDocument/getDocumentText produisent déjà des messages FR
    // actionnables (type non supporté, taille, scan sans texte…).
    return NextResponse.json(
      { error: "attachment_failed", message: e instanceof Error ? e.message : "Fichier illisible." },
      { status: 422 },
    );
  }
}
