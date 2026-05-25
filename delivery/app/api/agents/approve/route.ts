/**
 * app/api/agents/approve/route.ts
 * ────────────────────────────────────────────────────────────
 * Validation des outputs d'agents.
 *
 * action = "approve" → publie l'output (selon son kind)
 * action = "reject"  → marque rejeté, rien n'est publié
 *
 * C'est ici que se fait le passage "pending → publié".
 * Réservé aux admins.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { uniqueSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await getAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
  }

  const { outputId, action } = await req.json().catch(() => ({}));
  if (!outputId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const sb = createAdminClient();

  const { data: output } = await sb
    .from("agent_outputs")
    .select("*")
    .eq("id", outputId)
    .single();

  if (!output) return NextResponse.json({ error: "Output introuvable" }, { status: 404 });
  if (output.status !== "pending") {
    return NextResponse.json({ error: "Output déjà traité" }, { status: 409 });
  }

  // ── REJET ──
  if (action === "reject") {
    await sb
      .from("agent_outputs")
      .update({ status: "rejected", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
      .eq("id", outputId);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // ── SÉCURITÉ : un output sandbox ne doit JAMAIS être publié en prod ──
  if (output.is_sandbox) {
    await sb
      .from("agent_outputs")
      .update({ status: "approved", reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
      .eq("id", outputId);
    return NextResponse.json({
      ok: true,
      status: "approved",
      note: "Output sandbox marqué validé (non publié — données de test).",
    });
  }

  // ── APPROBATION → publication selon le type ──
  let publishedRef: string | null = null;

  try {
    if (output.kind === "prompt") {
      publishedRef = await publishPrompt(sb, output.payload);
    } else if (output.kind === "blog_article") {
      // Si tu as une table blog_posts, insère ici. Sinon, garde en "approved".
      // publishedRef = await publishBlogArticle(sb, output.payload);
    }
    // linkedin_post / email / outreach / price_suggestion :
    // pas de publication automatique — l'approbation = "vu et validé",
    // tu utilises le contenu manuellement.
  } catch (err) {
    return NextResponse.json(
      { error: `Échec publication : ${String(err)}` },
      { status: 500 }
    );
  }

  await sb
    .from("agent_outputs")
    .update({
      status: "published",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      published_ref: publishedRef,
    })
    .eq("id", outputId);

  return NextResponse.json({ ok: true, status: "published", publishedRef });
}

/**
 * Publie un prompt validé : crée le listing + la première version.
 * Respecte le schéma : listings.creator_id, listing_versions.prompt_body,
 * listings.current_version_id, price_cents.
 */
async function publishPrompt(
  sb: ReturnType<typeof createAdminClient>,
  payload: Record<string, unknown>
): Promise<string> {
  const personaId = payload.persona_id as string;

  // Récupère le profil lié au persona
  const { data: persona } = await sb
    .from("personas")
    .select("profile_id")
    .eq("id", personaId)
    .single();

  if (!persona?.profile_id) {
    throw new Error("Persona sans profil lié — crée d'abord les comptes personas.");
  }

  const title = payload.title as string;
  const slug = uniqueSlug(title);

  // 1. Créer le listing (statut published puisque tu viens de l'approuver)
  const { data: listing, error: listingErr } = await sb
    .from("listings")
    .insert({
      creator_id: persona.profile_id,
      type: "prompt",
      title,
      slug,
      description: payload.description as string,
      tags: (payload.tags as string[]) ?? [],
      price_cents: (payload.price_cents as number) ?? 0,
      currency: "eur",
      status: "published",
    })
    .select("id")
    .single();

  if (listingErr || !listing) {
    throw new Error(`Insert listing: ${listingErr?.message}`);
  }

  // 2. Créer la première version avec le corps du prompt
  const { data: version, error: versionErr } = await sb
    .from("listing_versions")
    .insert({
      listing_id: listing.id,
      semver: "1.0.0",
      changelog: "Version initiale",
      prompt_body: payload.prompt_body as string,
    })
    .select("id")
    .single();

  if (versionErr || !version) {
    throw new Error(`Insert version: ${versionErr?.message}`);
  }

  // 3. Lier la version courante au listing
  await sb.from("listings").update({ current_version_id: version.id }).eq("id", listing.id);

  return listing.id as string;
}
