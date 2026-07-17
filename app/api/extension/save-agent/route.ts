import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AgentManifestSchema } from "@/lib/agent/schema";
import { buildContract } from "@/lib/agent/contract";
import { uniqueSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

/**
 * « Enregistrer comme agent » : transforme une mission réussie de l'extension
 * en agent PRIVÉ réutilisable (brouillon éditable dans le builder, relançable
 * depuis le dashboard). Le pont entre l'usage quotidien et la bibliothèque.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { runId?: string } | null;
  const runId = body?.runId?.trim();
  if (!runId) return NextResponse.json({ error: "invalid_run", message: "runId requis." }, { status: 400 });

  const admin = createAdminClient();
  const { data: run } = await admin
    .from("listing_agent_runs")
    .select("id, user_id, inputs")
    .eq("id", runId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "not_found", message: "Mission introuvable." }, { status: 404 });

  const inputs = (run.inputs ?? {}) as Record<string, string>;
  const embedded = inputs.__manifest;
  if (typeof embedded !== "string") {
    return NextResponse.json(
      { error: "no_manifest", message: "Cette mission n'a pas de plan enregistrable." },
      { status: 422 },
    );
  }

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(embedded);
  } catch {
    return NextResponse.json({ error: "bad_manifest", message: "Plan illisible." }, { status: 422 });
  }
  const parsed = AgentManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_manifest", message: "Plan invalide." }, { status: 422 });
  }
  const manifest = parsed.data;

  // Les contenus de page/onglets de LA mission d'origine ({{page_active}},
  // {{tab_N}}) sont contextuels : lors d'une réutilisation ils seront refournis
  // par l'extension — on les déclare comme entrées pour que le builder les voie.
  const contextKeys = new Set<string>();
  const scan = (text: string) => {
    for (const m of text.matchAll(/\{\{(page_active|tab_\d+)[.}]/g)) contextKeys.add(m[1]);
  };
  const walk = (steps: typeof manifest.steps) => {
    for (const s of steps) {
      if (s.type === "llm") scan(s.prompt);
      else if (s.type === "browser") scan(s.goal);
      else if (s.type === "tool" || s.type === "action") Object.values(s.params ?? {}).forEach(scan);
      else if (s.type === "parallel") s.branches.forEach((b) => walk(b.steps as typeof manifest.steps));
    }
  };
  walk(manifest.steps);
  const extraInputs = [...contextKeys].map((key) => ({
    key,
    label: key === "page_active" ? "Contenu de la page active" : `Contenu de l'onglet ${key.slice(4)}`,
    type: "textarea" as const,
    required: false,
  }));
  const savedManifest = {
    ...manifest,
    inputs: [...manifest.inputs.filter((i) => !contextKeys.has(i.key)), ...extraInputs],
  };

  const title = (inputs.__title || inputs.__goal || "Agent Prompta").slice(0, 120);
  const { data: listing, error: listingErr } = await admin
    .from("listings")
    .insert({
      creator_id: user.id,
      type: "agent",
      title,
      slug: uniqueSlug(title),
      description: inputs.__goal ? `Créé depuis Prompta partout — ordre d'origine : ${inputs.__goal.slice(0, 400)}` : null,
      models: [],
      tags: ["prompta-partout"],
      price_cents: 0,
      pricing_mode: "free",
      currency: "eur",
      status: "draft",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select("id")
    .single();
  if (listingErr || !listing) {
    return NextResponse.json({ error: "insert_failed", message: listingErr?.message ?? "Création impossible." }, { status: 500 });
  }

  const contract = buildContract(savedManifest.steps);
  const { data: version, error: versionErr } = await admin
    .from("listing_versions")
    .insert({
      listing_id: listing.id,
      semver: "v1.0",
      prompt_body: null,
      env: { manifest: savedManifest },
      contract: JSON.parse(JSON.stringify(contract)),
      bundle_path: null,
    })
    .select("id")
    .single();
  if (versionErr || !version) {
    await admin.from("listings").delete().eq("id", listing.id);
    return NextResponse.json({ error: "version_failed", message: versionErr?.message ?? "Création impossible." }, { status: 500 });
  }

  await admin.from("listings").update({ current_version_id: version.id }).eq("id", listing.id);

  return NextResponse.json({
    listingId: listing.id,
    title,
    url: `/dashboard/runs`,
  });
}
