import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { currentPassword, newPassword } = body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit contenir au moins 8 caractères." },
      { status: 400 }
    );
  }

  // Un compte email/mot de passe DOIT prouver le mot de passe actuel (sinon une
  // session volée suffit à verrouiller le compte). Les comptes OAuth purs n'ont
  // pas de mot de passe actuel : ils peuvent en définir un.
  const hasPasswordIdentity = (user.identities ?? []).some((i) => i.provider === "email");
  if (hasPasswordIdentity) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Mot de passe actuel requis." }, { status: 400 });
    }
    if (!user.email) {
      return NextResponse.json({ error: "Compte sans email — changement impossible." }, { status: 400 });
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) {
      return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 403 });
    }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
