/**
 * BATTERIE DE PLOMBERIE — pilote. Le cœur (lib/composio/plumbing-battery.ts)
 * tourne côté SERVEUR via /api/cron/composio-audit?plumbing=… (la clé Composio
 * n'existe qu'en prod). Ce script pagine le catalogue, lance les lots, agrège.
 *
 * Usage : npx tsx scripts/plumbing-battery.ts [--limit N] [--base URL]
 */

import { writeFileSync, mkdirSync } from "fs";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const BASE_URL = (() => {
  const i = process.argv.indexOf("--base");
  return (i > -1 ? process.argv[i + 1] : process.env.QA_BASE_URL) ?? "https://prompta-sjtf.onrender.com";
})();
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i > -1 ? Number(process.argv[i + 1]) : Infinity;
})();
const BATCH = 8;

interface Failure { toolkit: string; check: string; action: string; detail: string }

async function probe(params: string, timeoutMs = 240_000): Promise<Record<string, unknown>> {
  const cron = process.env.CRON_SECRET;
  if (!cron) throw new Error("CRON_SECRET requis (.env.local)");
  const res = await fetch(`${BASE_URL}/api/cron/composio-audit?${params}`, {
    headers: { authorization: `Bearer ${cron}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  const started = Date.now();

  // 1. Tous les slugs du catalogue, par pages.
  const slugs: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const d = (await probe(`slugs=1&offset=${offset}&limit=100`)) as { slugs?: string[] };
    if (!d.slugs?.length) break;
    slugs.push(...d.slugs);
    if (slugs.length >= LIMIT) break;
  }
  const targets = slugs.slice(0, LIMIT);
  console.log(`Catalogue : ${slugs.length} toolkits — batterie sur ${targets.length} (cible ${BASE_URL}).`);

  // 2. Lots de BATCH toolkits vers la sonde plumbing.
  const failures: Failure[] = [];
  const counters: Record<string, number> = {};
  let done = 0;
  const failedBatches: string[] = [];
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    let got = false;
    for (let attempt = 1; attempt <= 3 && !got; attempt++) {
      try {
        const d = (await probe(`plumbing=${encodeURIComponent(batch.join(","))}`)) as {
          failures?: Failure[];
          counters?: Record<string, number>;
        };
        // Une réponse 200 SANS `counters` = version déployée sans la sonde
        // plumbing (le paramètre est ignoré et l'audit historique répond).
        // Compter « zéro échec » serait un faux vert : on échoue bruyamment.
        if (!d.counters) {
          throw new Error("réponse sans `counters` — la sonde plumbing n'est pas déployée sur cette cible");
        }
        for (const f of d.failures ?? []) failures.push(f);
        for (const [k, v] of Object.entries(d.counters ?? {})) counters[k] = (counters[k] ?? 0) + Number(v);
        got = true;
      } catch (e) {
        if (attempt === 3) failedBatches.push(batch.join(","));
        else await new Promise((r) => setTimeout(r, 5000));
      }
    }
    done += batch.length;
    if (done % 80 < BATCH) {
      console.log(`  … ${Math.min(done, targets.length)}/${targets.length} toolkits (${failures.length} échecs)`);
    }
  }

  // 3. Rapport.
  const byCheck = new Map<string, Failure[]>();
  for (const f of failures) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check)!.push(f);
  }
  console.log(`\n══ RÉSULTATS (${Math.round((Date.now() - started) / 1000)}s) ══`);
  console.log(`Toolkits : ${done} · résolution : ${counters.resolution_cases ?? 0} cas · param-guard : ${counters.guard_cases ?? 0} cas`);
  if (failedBatches.length) console.log(`⚠️ ${failedBatches.length} lot(s) sonde en échec (timeouts) — relancer avec --limit sur ces slugs.`);
  for (const [check, list] of [...byCheck.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n✗ ${check} — ${list.length} cas`);
    for (const f of list.slice(0, 10)) console.log(`   ${f.toolkit} · ${f.action} — ${f.detail}`);
    if (list.length > 10) console.log(`   … +${list.length - 10}`);
  }
  if (failures.length === 0) console.log("\n✅ Aucun échec de plomberie.");

  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/plumbing-battery.json",
    JSON.stringify({ base: BASE_URL, testedToolkits: done, counters, failedBatches, failures }, null, 2),
  );
  console.log(`\nRapport : test-results/plumbing-battery.json`);
  process.exit((counters.guard_crash ?? 0) + (counters.resolution_crash ?? 0) > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Batterie interrompue :", e);
  process.exit(1);
});
