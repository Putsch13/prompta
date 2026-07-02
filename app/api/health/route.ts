import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Sonde de santé/version : permet de vérifier quel commit tourne. */
export function GET() {
  return NextResponse.json({
    ok: true,
    commit: process.env.RENDER_GIT_COMMIT ?? null,
    at: new Date().toISOString(),
  });
}
