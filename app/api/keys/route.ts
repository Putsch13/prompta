import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listUserKeys,
  saveUserKey,
  deleteUserKey,
  testUserKey,
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
  const supabase = createClient();
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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { provider, apiKey, action } = body as {
    provider: KeyProvider;
    apiKey?: string;
    action?: "test" | "rotate";
  };

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Provider invalide" }, { status: 400 });
  }

  if (action === "test" && apiKey) {
    const valid = await testUserKey(user.id, provider, apiKey);
    return NextResponse.json({ valid });
  }

  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json({ error: "Clé API invalide" }, { status: 400 });
  }

  let valid = false;
  try {
    valid = await testUserKey(user.id, provider, apiKey);
  } catch {
    valid = false;
  }

  const key = await saveUserKey(
    user.id,
    provider,
    apiKey,
    action === "rotate" ? "rotated" : "added",
    valid
  );

  return NextResponse.json({ key, valid });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
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
