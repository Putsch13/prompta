import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listUserDocuments,
  uploadUserDocument,
} from "@/lib/documents/user-documents";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const documents = await listUserDocuments(user.id);
  return NextResponse.json({ documents });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
  }

  try {
    const document = await uploadUserDocument(user.id, file);
    return NextResponse.json({ document });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload échoué" },
      { status: 400 }
    );
  }
}
