/**
 * Publie l'agent signature « Assistant Email Pro » (SCALE-1).
 *
 * Usage : CREATOR_USERNAME=admin npx tsx scripts/seed-signature-agent.ts
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env";
import { SIGNATURE_AGENT_SLUG, SIGNATURE_EMAIL_AGENT } from "../lib/templates/signature-email-agent";

loadEnvFiles();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const creatorUsername = process.env.CREATOR_USERNAME ?? "admin";

if (!url || !serviceKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, username")
    .eq("username", creatorUsername)
    .single();

  if (!profile) {
    console.error(`❌ Profil @${creatorUsername} introuvable.`);
    process.exit(1);
  }

  const { data: existing } = await admin
    .from("listings")
    .select("id, slug")
    .eq("slug", SIGNATURE_AGENT_SLUG)
    .maybeSingle();

  if (existing) {
    console.log(`✓ Agent signature déjà présent : /listing/${SIGNATURE_AGENT_SLUG}`);
    return;
  }

  const { data: listing, error: listingError } = await admin
    .from("listings")
    .insert({
      creator_id: profile.id,
      title: SIGNATURE_EMAIL_AGENT.title,
      slug: SIGNATURE_AGENT_SLUG,
      type: "agent",
      description: SIGNATURE_EMAIL_AGENT.description,
      price_cents: 0,
      pricing_mode: "free",
      subscription_price_cents: 0,
      models: SIGNATURE_EMAIL_AGENT.models,
      tags: SIGNATURE_EMAIL_AGENT.tags,
      status: "published",
      tech_stack: [],
      integrations: [],
    })
    .select("id")
    .single();

  if (listingError || !listing) {
    console.error("❌ Erreur création listing:", listingError?.message);
    process.exit(1);
  }

  const { data: version, error: versionError } = await admin
    .from("listing_versions")
    .insert({
      listing_id: listing.id,
      semver: "1.0.0",
      prompt_body: null,
      env: { manifest: SIGNATURE_EMAIL_AGENT.manifest },
      bundle_path: null,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    console.error("❌ Erreur version:", versionError?.message);
    process.exit(1);
  }

  await admin
    .from("listings")
    .update({ current_version_id: version.id })
    .eq("id", listing.id);

  console.log(`✅ Agent signature publié : ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/listing/${SIGNATURE_AGENT_SLUG}`);
  console.log("   Démo : coller un email → lancer → obtenir une réponse pro en ~30 s.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
