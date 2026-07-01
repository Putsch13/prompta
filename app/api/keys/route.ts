import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listUserKeys,
  saveUserKey,
  deleteUserKey,
  validateProviderKey,
  type KeyProvider,
} from "@/lib/keys";

export const dynamic = "force-dynamic";

const VALID_PROVIDERS: KeyProvider[] = [
  "openai",
  "anthropic",
  "google",
  "mistral",
  "serper",
];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const keys = await listUserKeys(user.id);
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { provider, apiKey, action, saveEvenIfInvalid } = body as {
    provider: KeyProvider;
    apiKey?: string;
    action?: "test" | "rotate";
    saveEvenIfInvalid?: boolean;
  };

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Provider invalide" }, { status: 400 });
  }

  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json({ error: "Clé API invalide" }, { status: 400 });
  }

  const validation = await validateProviderKey(provider, apiKey);

  if (action === "test") {
    return NextResponse.json({ validation });
  }

  if (!validation.valid && !saveEvenIfInvalid) {
    return NextResponse.json({
      validation,
      saved: false,
      message: validation.message,
    });
  }

  const key = await saveUserKey(
    user.id,
    provider,
    apiKey,
    action === "rotate" ? "rotated" : "added",
    validation.valid
  );

  return NextResponse.json({
    key,
    saved: true,
    validation,
  });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider") as KeyProvider;

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Provider invalide" }, { status: 400 });
  }

  await deleteUserKey(user.id, provider);
  return NextResponse.json({ success: true });
}
