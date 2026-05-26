import { NextRequest, NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const admin = await getAdminOrNull();
  if (!admin) return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });

  const body = await _req.json().catch(() => ({}));
  const enabled = body.enabled as boolean | undefined;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) requis" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { error } = await sb
    .from("agent_definitions")
    .update({ is_enabled: enabled })
    .eq("slug", params.slug);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, slug: params.slug, enabled });
}
