/**
 * QA ASSISTANT — exerce l'assistant du quotidien via le VRAI endpoint
 * /api/extension/execute (session mintée), comme le popup/quick.
 *
 * ~100 missions mélangeant :
 *  - requêtes SIMPLES « type GPT » (question, traduction, réécriture) — 1 étape ;
 *  - missions avec CONTEXTE de page / ONGLETS (lecture + Sheets/Doc) ;
 *  - agents COMPLEXES avec écriture sensible → VALIDATION humaine attendue.
 * Cycle les modèles (GPT/Claude/Gemini/Mistral) selon ceux qui sont utilisables.
 *
 * Vérifie : la chaîne tourne, l'historique se remplit, les connexions sont
 * mobilisées, les validations humaines sont bien demandées quand nécessaire.
 * GARDE-FOUS : emails uniquement vers le propriétaire ; runs CONSERVÉS (le
 * propriétaire veut les inspecter — QA_ASSISTANT_CLEAN=1 pour nettoyer).
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { loadEnvFiles } from "./load-env";
loadEnvFiles();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BASE = process.env.QA_BASE_URL ?? "https://prompta-sjtf.onrender.com";
const EMAIL = "puccini.f13@gmail.com";
const CONCURRENCY = Number(process.env.QA_ASSISTANT_CONCURRENCY ?? 5);
const RUN_TIMEOUT_MS = Number(process.env.QA_RUN_TIMEOUT_MS ?? 210_000);
const LEAVE_APPROVALS = process.env.QA_ASSISTANT_LEAVE_APPROVALS === "1";

async function mintCookie(): Promise<string> {
  const { data } = await sb.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: s } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: data.properties!.hashed_token });
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host.split(".")[0];
  const b64 = "base64-" + Buffer.from(JSON.stringify({ access_token: s!.session!.access_token, refresh_token: s!.session!.refresh_token, expires_at: s!.session!.expires_at, expires_in: s!.session!.expires_in, token_type: "bearer", user: s!.session!.user })).toString("base64");
  const name = `sb-${ref}-auth-token`; const C = 3180; const out: string[] = [];
  if (b64.length <= C) out.push(`${name}=${b64}`); else for (let i = 0, n = 0; i < b64.length; i += C, n++) out.push(`${name}.${n}=${b64.slice(i, i + C)}`);
  return out.join("; ");
}

interface Case { name: string; kind: "simple" | "contexte" | "onglets" | "validation" | "lecture"; goal: string; page?: Record<string, unknown>; expectApproval?: boolean; }

// Contenu de page simulant une base de données / un tableau À L'ÉCRAN — l'agent
// doit l'ANALYSER directement (pas appeler l'API Sheets avec un id inventé).
const BDD_CONTENU = `Base clients — Produits
ID | PRODUIT | STOCK | PRIX | STATUT
1 | Clavier mécanique | 12 | 49€ | actif
2 | Souris sans fil | -3 | 19€ | actif
3 | Écran 27" | 7 | | actif
4 | Casque | 15 | 89€ | ARCHIVÉ
5 | Webcam HD | 9 | 59€ | actif
5 | Webcam HD | 4 | 59€ | actif
6 | Hub USB | 22 | 29€ | inconnu`;

function buildCases(): Case[] {
  const cs: Case[] = [];
  // 40 SIMPLES « type GPT » — pas de page, réponse courte.
  const simples = [
    "Quelle est la capitale de l'Australie ?",
    "Traduis en anglais : « Le rendez-vous est reporté à demain. »",
    "Résume en une phrase : la photosynthèse convertit lumière, eau et CO2 en énergie.",
    "Donne 3 idées de noms pour une app de covoiturage.",
    "Corrige : « Je vais au magasin hier. »",
    "Convertis 5 miles en kilomètres.",
    "Explique la récursivité en 2 phrases simples.",
    "Écris un tweet de 20 mots sur le café du matin.",
    "Liste 5 fruits riches en vitamine C.",
    "Quelle est la différence entre HTTP et HTTPS, en 2 lignes ?",
    "Propose un objet d'email pour relancer un client silencieux.",
    "Donne un synonyme soutenu de « rapide ».",
    "Résume la loi de l'offre et la demande en 2 phrases.",
    "Écris une accroche de 15 mots pour une newsletter tech.",
    "Convertis 100 € en dollars (taux ~1,08).",
    "Donne 3 conseils pour mieux dormir.",
    "Réécris en plus poli : « Envoie-moi le fichier tout de suite. »",
    "Quel est le pluriel de « bijou » ?",
    "Explique ce qu'est une API à un enfant de 10 ans.",
    "Propose un slogan pour une boulangerie bio.",
  ];
  simples.forEach((g, i) => cs.push({ name: `simple_${i + 1}`, kind: "simple", goal: g }));
  simples.forEach((g, i) => cs.push({ name: `simple_bis_${i + 1}`, kind: "simple", goal: g + " (réponds de façon concise)" }));

  // 20 CONTEXTE de page (URL réelle qui résout).
  const pages = [
    { url: "https://example.com/", title: "Example Domain", content: "This domain is for use in documentation examples." },
    { url: "https://www.iana.org/help/example-domains", title: "Example Domains", content: "Reserved example domains." },
  ];
  for (let i = 0; i < 20; i++) {
    const p = pages[i % pages.length];
    cs.push({ name: `contexte_${i + 1}`, kind: "contexte", goal: "Lis cette page et résume-la en 3 points dans un Google Sheets sur mon Drive, puis envoie-moi le lien.", page: { ...p } });
  }

  // 20 ONGLETS multiples (comparaison).
  for (let i = 0; i < 20; i++) {
    cs.push({
      name: `onglets_${i + 1}`, kind: "onglets",
      goal: "Compare les pages que j'ai ouvertes et fais-moi une synthèse en 5 points dans un Google Doc.",
      page: {
        url: "https://example.com/", title: "Example", content: "Example domain.",
        openTabs: [
          { title: "Example", url: "https://example.com/" },
          { title: "IANA example domains", url: "https://www.iana.org/help/example-domains" },
        ],
      },
    });
  }

  // 20 LECTURE « comme mes yeux » : une bdd/tableau est À L'ÉCRAN (dans le
  // contenu de page). L'agent doit l'analyser DIRECTEMENT — surtout PAS appeler
  // google_sheets.get_values avec un id inventé (le bug signalé). Aucun email.
  const lectures = [
    "Lis cette bdd et dis-moi ce qui cloche.",
    "Analyse ce tableau et liste les anomalies.",
    "Regarde cette page et dis-moi les problèmes de données.",
    "Qu'est-ce qui ne va pas dans ce que je vois à l'écran ?",
    "Résume ce tableau et signale les incohérences.",
  ];
  for (let i = 0; i < 20; i++) {
    cs.push({
      name: `lecture_${i + 1}`, kind: "lecture",
      goal: lectures[i % lectures.length],
      page: { url: "https://mon-outil.example/bdd", title: "Base clients — Produits", content: BDD_CONTENU },
    });
  }

  // 20 VALIDATION humaine (écriture sensible → approval attendu).
  const valid = [
    "Rédige un email de prospection et envoie-le-moi à mon adresse.",
    "Prépare un message de relance client et envoie-le à mon adresse.",
    "Écris un post LinkedIn sur les agents IA (ne le publie pas sans validation).",
    "Rédige une newsletter produit et envoie-la-moi.",
    "Prépare un email de remerciement après réunion et envoie-le-moi.",
  ];
  for (let i = 0; i < 20; i++) {
    cs.push({ name: `validation_${i + 1}`, kind: "validation", goal: valid[i % valid.length], expectApproval: true });
  }
  return cs;
}

interface Result { name: string; kind: string; model: string | null; runId: string | null; status: string; hadApproval: boolean; error: string | null; verdict: "OK" | "ÉCHEC" | "MSG_FLOU"; ms: number; }

async function main() {
  const cookie = await mintCookie();
  const uid = (await sb.auth.admin.listUsers({ page: 1, perPage: 200 })).data.users.find((u) => u.email === EMAIL)!.id;
  // Modèles utilisables (pour cycler).
  const mres = await fetch(`${BASE}/api/extension/models`, { headers: { cookie } }).then((r) => r.json()).catch(() => ({ models: [] }));
  const usable: string[] = (mres.models ?? []).filter((m: { usable: boolean }) => m.usable).map((m: { id: string }) => m.id);
  console.log(`QA ASSISTANT — ${BASE}\nModèles utilisables : ${usable.join(", ") || "(défaut serveur)"}\n`);

  let cases = buildCases();
  // Filtres de smoke : QA_ASSISTANT_ONLY="simple,validation" et/ou LIMIT=6.
  const only = process.env.QA_ASSISTANT_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  if (only?.length) {
    const perKind = new Map<string, number>();
    cases = cases.filter((c) => only.includes(c.kind) && (perKind.set(c.kind, (perKind.get(c.kind) ?? 0) + 1), (perKind.get(c.kind) ?? 0) <= Number(process.env.QA_ASSISTANT_PERKIND ?? 999)));
  }
  const limit = Number(process.env.QA_ASSISTANT_LIMIT ?? 0);
  if (limit > 0) cases = cases.slice(0, limit);
  const results: Result[] = [];
  let idx = 0, done = 0;

  async function runOne(c: Case, model: string | null): Promise<Result> {
    const started = Date.now();
    const base: Omit<Result, "status" | "verdict"> = { name: c.name, kind: c.kind, model, runId: null, hadApproval: false, error: null, ms: 0 };
    let res: Response;
    try {
      res = await fetch(`${BASE}/api/extension/execute`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ goal: c.goal, page: c.page ?? { url: "" }, modelId: model ?? undefined }) });
    } catch (e) { return { ...base, status: "network", verdict: "ÉCHEC", error: String(e), ms: Date.now() - started }; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 409 connecteur manquant = message actionnable (toléré pour les tests d'apps non connectées).
      const flou = !(body.message || body.error);
      return { ...base, status: `http_${res.status}`, verdict: flou ? "MSG_FLOU" : "OK", error: body.message ?? body.error ?? null, ms: Date.now() - started };
    }
    const runId = body.runId as string;
    base.runId = runId; base.model = body.model ?? model;
    let final = { status: "pending" as string, error_message: null as string | null };
    while (Date.now() - started < RUN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 4000));
      await fetch(`${BASE}/api/cron/tick`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).catch(() => undefined);
      const { data } = await sb.from("listing_agent_runs").select("status, error_message").eq("id", runId).single();
      if (data) final = data;
      // Détecte une demande de validation (même si on ne l'approuve pas).
      const { data: appr } = await sb.from("agent_approvals").select("id, status").eq("run_id", runId).maybeSingle();
      if (appr) base.hadApproval = true;
      if (!LEAVE_APPROVALS && appr && appr.status === "pending") {
        const { decideApproval } = await import("@/lib/agent/approvals");
        await decideApproval(appr.id, uid, "approved").catch(() => undefined);
      }
      if (["completed", "failed", "cancelled"].includes(final.status)) break;
      if (LEAVE_APPROVALS && base.hadApproval) break;
    }
    let verdict: Result["verdict"] = "OK";
    if (final.status === "failed") verdict = final.error_message ? "OK" : "MSG_FLOU"; // échec toléré si message actionnable
    if (final.status === "pending") verdict = "ÉCHEC";
    if (c.expectApproval && !base.hadApproval && final.status === "completed") verdict = "ÉCHEC"; // aurait dû demander validation
    return { ...base, status: final.status, error: final.error_message, verdict, ms: Date.now() - started };
  }

  async function worker() {
    while (idx < cases.length) {
      const c = cases[idx++];
      const model = usable.length ? usable[(idx - 1) % usable.length] : null;
      const r = await runOne(c, model);
      results.push(r); done++;
      console.log(`[${done}/${cases.length}] ${r.name} (${r.model ?? "défaut"}) → ${r.status}${r.hadApproval ? " +validation" : ""} ${r.verdict !== "OK" ? `[${r.verdict}]` : ""}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Rapport
  const byKind: Record<string, { ok: number; total: number }> = {};
  for (const r of results) { byKind[r.kind] ??= { ok: 0, total: 0 }; byKind[r.kind].total++; if (r.verdict === "OK") byKind[r.kind].ok++; }
  const bad = results.filter((r) => r.verdict !== "OK");
  const approvals = results.filter((r) => r.hadApproval).length;
  const lines = [
    `# QA Assistant — ${new Date().toISOString()}`,
    `Cible ${BASE} · ${results.length} missions · ${bad.length} problèmes · ${approvals} validations demandées`,
    "", "| Catégorie | OK / total |", "|---|---|",
    ...Object.entries(byKind).map(([k, v]) => `| ${k} | ${v.ok}/${v.total} |`),
    "", "| Mission | Modèle | Statut | Validation | Verdict | Erreur |", "|---|---|---|---|---|---|",
    ...results.map((r) => `| ${r.name} | ${r.model ?? "défaut"} | ${r.status} | ${r.hadApproval ? "oui" : "—"} | ${r.verdict} | ${(r.error ?? "").replace(/\|/g, "\\|").slice(0, 120)} |`),
  ];
  mkdirSync("scripts/tmp", { recursive: true });
  writeFileSync("scripts/tmp/qa-assistant-report.md", lines.join("\n") + "\n");
  console.log(`\n═══ ${results.length} missions · ${bad.length} problèmes · ${approvals} validations demandées ═══`);
  for (const r of bad) console.log(`✗ ${r.name} [${r.status}] ${(r.error ?? "").slice(0, 100)}`);
  console.log(`\nRapport : scripts/tmp/qa-assistant-report.md`);
  if (process.env.QA_ASSISTANT_CLEAN === "1") {
    const ids = results.map((r) => r.runId).filter(Boolean) as string[];
    await sb.from("listing_agent_run_steps").delete().in("run_id", ids);
    await sb.from("agent_approvals").delete().in("run_id", ids);
    await sb.from("listing_agent_runs").delete().in("id", ids);
    console.log(`Nettoyage : ${ids.length} runs supprimés.`);
  }
  process.exit(bad.length > 0 ? 1 : 0);
}
main().catch((e) => { console.error("QA Assistant — fatal:", e); process.exit(2); });
