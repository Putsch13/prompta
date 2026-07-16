import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { confirm, password } = body as { confirm?: string; password?: string };

  if (confirm !== "SUPPRIMER") {
    return NextResponse.json(
      { error: 'Tapez exactement "SUPPRIMER" pour confirmer.' },
      { status: 400 }
    );
  }

  // Action irréversible : un compte email/mot de passe doit prouver son mot de
  // passe (une session volée ne suffit pas). OAuth pur : pas de mot de passe.
  const hasPasswordIdentity = (user.identities ?? []).some((i) => i.provider === "email");
  if (hasPasswordIdentity) {
    if (!password) {
      return NextResponse.json({ error: "Mot de passe requis pour supprimer le compte." }, { status: 400 });
    }
    if (!user.email) {
      return NextResponse.json({ error: "Compte sans email — suppression impossible ici." }, { status: 400 });
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (signInError) {
      return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 403 });
    }
  }

  const admin = createAdminClient();

  const { data: docs } = await admin
    .from("user_documents")
    .select("storage_path")
    .eq("user_id", user.id);

  if (docs?.length) {
    await admin.storage
      .from("user-documents")
      .remove(docs.map((d) => d.storage_path));
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}
