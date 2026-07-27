import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Suspend/réactive ou supprime un planning (voir app/api/schedules/route.ts). */

async function ownedSchedule(userId: string, id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("scheduled_runs")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  return data && data.user_id === userId ? admin : null;
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const admin = await ownedSchedule(user.id, id);
  if (!admin) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as { active?: boolean } | null;
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "invalid_body", message: "`active` requis." }, { status: 400 });
  }

  await admin.from("scheduled_runs").update({ active: body.active }).eq("id", id);
  return NextResponse.json({ ok: true, active: body.active });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const admin = await ownedSchedule(user.id, id);
  if (!admin) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await admin.from("scheduled_runs").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
