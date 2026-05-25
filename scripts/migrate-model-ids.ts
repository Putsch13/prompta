/**
 * Script de migration des identifiants de modèles.
 * Remplace les anciens IDs de modèles dans les manifestes par les nouveaux.
 *
 * Usage: npx tsx scripts/migrate-model-ids.ts
 */

import { createClient } from "@supabase/supabase-js";
import { LEGACY_MODEL_MAP } from "../lib/catalogs";

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Erreur: SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log("Récupération des listing_versions...");

  const { data: versions, error } = await supabase
    .from("listing_versions")
    .select("id, env");

  if (error) {
    console.error("Erreur récupération:", error.message);
    process.exit(1);
  }

  if (!versions || versions.length === 0) {
    console.log("Aucune version trouvée.");
    return;
  }

  console.log(`${versions.length} versions à analyser.`);

  let updated = 0;
  let skipped = 0;

  for (const version of versions) {
    const env = version.env as { manifest?: { steps?: { model?: string }[] } } | null;

    if (!env?.manifest?.steps) {
      skipped++;
      continue;
    }

    let changed = false;
    const newSteps = env.manifest.steps.map((step) => {
      if (step.model && LEGACY_MODEL_MAP[step.model]) {
        const newModel = LEGACY_MODEL_MAP[step.model];
        console.log(`  [${version.id}] ${step.model} → ${newModel}`);
        changed = true;
        return { ...step, model: newModel };
      }
      return step;
    });

    if (changed) {
      const newEnv = {
        ...env,
        manifest: {
          ...env.manifest,
          steps: newSteps,
        },
      };

      const { error: updateError } = await supabase
        .from("listing_versions")
        .update({ env: newEnv })
        .eq("id", version.id);

      if (updateError) {
        console.error(`  Erreur update ${version.id}:`, updateError.message);
      } else {
        updated++;
      }
    } else {
      skipped++;
    }
  }

  console.log("\n--- Résumé ---");
  console.log(`Versions mises à jour: ${updated}`);
  console.log(`Versions ignorées (pas de changement): ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
