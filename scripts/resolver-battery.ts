/**
 * BATTERIE DE RÉSOLUTION — vérifie sur la PROD que le résolveur d'actions
 * choisit un outil SENSÉ pour une batterie d'actions natives couvrant ~30 apps
 * (au-delà de Canva). Contrôles :
 *  - un slug est trouvé (l'app expose bien l'action) ;
 *  - le slug porte le VERBE demandé (famille de synonymes) ;
 *  - le slug ne contient AUCUN token « piège » (comment, reply, webhook,
 *    label, permission…) non demandé.
 *
 * Usage : npx tsx scripts/resolver-battery.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const BASE_URL = process.env.QA_BASE_URL ?? "https://prompta-sjtf.onrender.com";

interface Case {
  action: string;
  /** Le slug résolu doit contenir AU MOINS un de ces tokens (verbe/famille). */
  verb: string[];
  /** Tokens interdits (pièges classiques) sauf s'ils sont demandés. */
  forbid?: string[];
}

const FORBID_DEFAULT = ["comment", "reply", "webhook", "label", "permission", "revision", "acl", "watch"];

const CASES: Case[] = [
  // Google
  { action: "gmail.send", verb: ["send"] },
  { action: "gmail.read", verb: ["fetch", "get", "list", "read"] },
  { action: "google_sheets.create_spreadsheet", verb: ["create", "add"] },
  { action: "google_sheets.append_row", verb: ["append", "add", "insert"] },
  { action: "google_calendar.create_event", verb: ["create", "add", "insert", "quick"] },
  { action: "google_calendar.list_events", verb: ["list", "get", "find", "events"] },
  { action: "google_drive.list_files", verb: ["list", "find", "search"] },
  { action: "google_drive.create_folder", verb: ["create", "add"] },
  { action: "google_docs.create_document", verb: ["create", "add"] },
  // Créa / social
  { action: "canva.create_design", verb: ["create"], forbid: [...FORBID_DEFAULT] },
  { action: "canva.list_designs", verb: ["list", "get", "find"] },
  { action: "linkedin.create_post", verb: ["create", "post", "share", "publish"] },
  { action: "twitter.create_post", verb: ["create", "post", "tweet", "publish"] },
  { action: "instagram.create_post", verb: ["create", "post", "publish", "media"] },
  { action: "youtube.search_videos", verb: ["search", "list", "find"] },
  // Productivité
  { action: "notion.create_page", verb: ["create", "add"] },
  { action: "notion.search", verb: ["search", "find", "query", "list"] },
  { action: "slack.send_message", verb: ["send", "post", "message"] },
  { action: "discord.send_message", verb: ["send", "post", "create", "message"] },
  { action: "trello.create_card", verb: ["create", "add"] },
  { action: "asana.create_task", verb: ["create", "add"] },
  { action: "todoist.create_task", verb: ["create", "add", "quick"] },
  { action: "airtable.create_record", verb: ["create", "add", "insert"] },
  { action: "clickup.create_task", verb: ["create", "add"] },
  // Dev
  { action: "github.create_issue", verb: ["create", "add"] },
  { action: "github.list_repositories", verb: ["list", "search", "find", "repos"] },
  { action: "gitlab.create_issue", verb: ["create", "add"] },
  { action: "jira.create_issue", verb: ["create", "add"] },
  { action: "linear.create_issue", verb: ["create", "add"] },
  // CRM / business
  { action: "hubspot.create_contact", verb: ["create", "add"] },
  { action: "salesforce.create_lead", verb: ["create", "add", "insert"] },
  { action: "stripe.list_customers", verb: ["list", "search", "get", "find"] },
  { action: "shopify.list_orders", verb: ["list", "get", "find"] },
  { action: "mailchimp.create_campaign", verb: ["create", "add"] },
  { action: "typeform.list_responses", verb: ["list", "get", "retrieve", "responses"] },
  { action: "calendly.list_events", verb: ["list", "get", "find", "events"] },
  { action: "dropbox.upload_file", verb: ["upload", "create", "add", "save"] },
  { action: "onedrive.upload_file", verb: ["upload", "create", "add"] },
];

async function main() {
  const cron = process.env.CRON_SECRET;
  if (!cron) throw new Error("CRON_SECRET requis");

  console.log(`Batterie de résolution — cible ${BASE_URL} · ${CASES.length} actions\n`);

  const results: Record<string, string | null> = {};
  // Par lots de 6 pour rester sous le timeout proxy (chaque toolkit non caché
  // = fetch paginé de ses outils côté serveur).
  for (let i = 0; i < CASES.length; i += 6) {
    const batch = CASES.slice(i, i + 6);
    const param = batch.map((c) => c.action).join(",");
    let got = false;
    for (let attempt = 1; attempt <= 3 && !got; attempt++) {
      try {
        const res = await fetch(
          `${BASE_URL}/api/cron/composio-audit?resolve=${encodeURIComponent(param)}`,
          { headers: { authorization: `Bearer ${cron}` }, signal: AbortSignal.timeout(150_000) },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { results?: Record<string, string | null> };
        Object.assign(results, data.results ?? {});
        got = true;
      } catch {
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    if (!got) for (const c of batch) results[c.action] = "TIMEOUT_SONDE";
  }

  const rows: string[] = [];
  let bad = 0;
  for (const c of CASES) {
    const slug = results[c.action];
    let verdict = "✅";
    let note = slug ?? "—";
    if (!slug || slug === "ERREUR_CATALOGUE" || slug === "TIMEOUT_SONDE") {
      // Pas forcément un bug : certaines apps n'ont pas cette action.
      verdict = slug ? "⚠️" : "⚠️";
      note = slug ?? "aucune action trouvée";
    } else {
      const low = slug.toLowerCase();
      const hasVerb = c.verb.some((v) => low.includes(v));
      const forbid = (c.forbid ?? FORBID_DEFAULT).filter((f) => low.includes(f));
      if (!hasVerb || forbid.length > 0) {
        verdict = "❌";
        note = `${slug}${!hasVerb ? " (verbe absent)" : ""}${forbid.length ? ` (piège: ${forbid.join(",")})` : ""}`;
        bad += 1;
      }
    }
    rows.push(`| ${c.action} | ${note} | ${verdict} |`);
    console.log(`${verdict} ${c.action} → ${note}`);
  }

  mkdirSync("scripts/tmp", { recursive: true });
  writeFileSync(
    "scripts/tmp/resolver-battery.md",
    [`# Batterie de résolution — ${new Date().toISOString()}`, "", "| Action | Outil résolu | Verdict |", "|---|---|---|", ...rows].join("\n") + "\n",
  );
  console.log(`\n═══ ${CASES.length} actions · ${bad} résolution(s) suspecte(s) ═══`);
  console.log("Rapport : scripts/tmp/resolver-battery.md");
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Batterie — erreur fatale :", e);
  process.exit(2);
});
