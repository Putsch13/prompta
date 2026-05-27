import { NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/admin/guard";
import { reapStaleRunningRuns } from "@/lib/worker/reap-stale-runs";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await getAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const cleaned = await reapStaleRunningRuns();

  return NextResponse.json({
    ok: true,
    cleaned,
    message: `${cleaned} run(s) stale nettoyé(s)`,
  });
}
