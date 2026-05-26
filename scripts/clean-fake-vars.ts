/**
 * Retire les fausses variables (variable, step_N_output, input) des manifestes.
 * Usage: node --env-file=.env.local ./node_modules/.bin/tsx scripts/clean-fake-vars.ts
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const FAKE_KEYS = new Set(["variable", "step_N_output", "input"]);

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const { data: versions, error } = await supabase.from("listing_versions").select("id, env");
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let updated = 0;
  for (const v of versions ?? []) {
    const env = v.env as { manifest?: { inputs?: { key: string }[] } } | null;
    if (!env?.manifest?.inputs) continue;

    const cleaned = env.manifest.inputs.filter((i) => !FAKE_KEYS.has(i.key) && !/^step_\d+_output$/.test(i.key));
    if (cleaned.length === env.manifest.inputs.length) continue;

    await supabase
      .from("listing_versions")
      .update({
        env: { ...env, manifest: { ...env.manifest, inputs: cleaned } },
      })
      .eq("id", v.id);
    updated++;
    console.log(`  Nettoyé ${v.id}`);
  }

  console.log(`\n${updated} version(s) nettoyée(s).`);
}

main().catch(console.error);
