import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreditBalance } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const balanceCents = await getCreditBalance(user.id);
  return NextResponse.json({ balanceCents });
}
