import { NextRequest, NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const admin = await getAdminOrNull();
  if (!admin) return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const enabled = body.enabled as boolean | undefined;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) requis" }, { status: 400 });
  }

  const slug = decodeURIComponent(params.slug);
  const sb = createAdminClient();

  const { data: existing, error: fetchError } = await sb
    .from("agent_definitions")
    .select("slug, is_enabled")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: `Agent « ${slug} » introuvable` }, { status: 404 });
  }

  const { data: updated, error } = await sb
    .from("agent_definitions")
    .update({ is_enabled: enabled })
    .eq("slug", slug)
    .select("slug, is_enabled")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    slug: updated.slug,
    enabled: updated.is_enabled,
    previous: existing.is_enabled,
  });
}
