import { NextRequest, NextResponse } from "next/server";
import { calculateMonthlyRevshare } from "@/lib/revshare";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = request.nextUrl.searchParams.get("period") ?? undefined;
  const result = await calculateMonthlyRevshare(period);

  return NextResponse.json({ ok: true, ...result });
}
