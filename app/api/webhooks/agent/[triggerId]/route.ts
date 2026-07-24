import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types.db";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, props: { params: Promise<{ triggerId: string }> }) {
  const params = await props.params;
  const triggerId = params.triggerId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient();

  const { data: trigger } = await admin
    .from("agent_triggers")
    .select("*")
    .eq("id", triggerId)
    .eq("enabled", true)
    .single();

  if (!trigger) {
    return NextResponse.json({ error: "Trigger introuvable ou désactivé" }, { status: 404 });
  }

  if (trigger.type !== "webhook") {
    return NextResponse.json({ error: "Ce trigger n'est pas de type webhook" }, { status: 400 });
  }

  let payload: Record<string, unknown> = {};
  const signature = request.headers.get("x-webhook-signature");
  const secret = trigger.webhook_secret as string | null;
  const rawBody = await request.text();

  // Deny-by-default : sans secret, n'importe qui connaissant l'URL pourrait
  // lancer des runs facturés au propriétaire avec un payload attaquant injecté
  // dans les {{variables}} du manifeste.
  if (!secret) {
    return NextResponse.json(
      { error: "Trigger sans secret — configure webhook_secret pour activer ce webhook" },
      { status: 403 },
    );
  }
  if (!signature) {
    return NextResponse.json({ error: "Signature manquante" }, { status: 401 });
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }

  const { data: listing } = await admin
    .from("listings")
    .select("current_version_id")
    .eq("id", trigger.listing_id)
    .single();

  if (!listing?.current_version_id) {
    return NextResponse.json({ error: "Listing sans version publiée" }, { status: 400 });
  }

  const { data: run } = await admin
    .from("listing_agent_runs")
    .insert({
      user_id: trigger.owner_id,
      listing_id: trigger.listing_id,
      version_id: listing.current_version_id,
      inputs: payload as Json,
      status: "pending",
    })
    .select("id")
    .single();

  await admin.from("agent_trigger_events").insert({
    trigger_id: triggerId,
    run_id: run?.id,
    payload: payload as Json,
  });

  return NextResponse.json({ ok: true, runId: run?.id });
}
