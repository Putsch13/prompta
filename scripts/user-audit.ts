/**
 * USER AUDIT — robot qui parcourt Prompta COMME UN UTILISATEUR et remonte
 * les bugs : pages publiques, portes d'auth, parcours authentifié complet
 * (dashboard, connexions, génération de plan IA, cycle de vie d'un agent :
 * créer → publier → préparer le run → supprimer), APIs de données.
 *
 * GARDE-FOUS :
 *  - compte utilisé : puccini.f13@gmail.com (propriétaire) via magiclink admin ;
 *  - aucun envoi vers des tiers ; l'agent de test créé est SUPPRIMÉ à la fin ;
 *  - coût LLM : une seule génération de plan (~2-5¢), dans le budget QA.
 *
 * Usage : npx tsx scripts/user-audit.ts
 *         QA_BASE_URL=https://… npx tsx scripts/user-audit.ts
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "fs";
import { loadEnvFiles } from "./load-env";

loadEnvFiles();

const SELF_EMAIL = "puccini.f13@gmail.com";
const BASE_URL = process.env.QA_BASE_URL ?? "https://prompta-sjtf.onrender.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

interface Check {
  section: string;
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}
const checks: Check[] = [];

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const r = await fn();
  return [r, Date.now() - t0];
}

function record(section: string, name: string, ok: boolean, detail: string, ms = 0) {
  checks.push({ section, name, ok, detail, ms });
  console.log(`${ok ? "✓" : "✗"} [${section}] ${name} — ${detail}${ms ? ` (${ms}ms)` : ""}`);
}

// ── Session utilisateur réelle (magiclink admin → cookie SSR) ───────────────

async function mintSessionCookies(): Promise<Record<string, string>> {
  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: SELF_EMAIL,
  });
  if (error || !link?.properties?.hashed_token) {
    throw new Error(`generateLink: ${error?.message ?? "pas de token"}`);
  }
  const anon = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (vErr || !verified.session) throw new Error(`verifyOtp: ${vErr?.message ?? "pas de session"}`);

  // Format cookie @supabase/ssr : base64url du JSON de session, chunké à ~3180.
  const payload = `base64-${Buffer.from(JSON.stringify(verified.session)).toString("base64url")}`;
  const name = `sb-${PROJECT_REF}-auth-token`;
  const cookies: Record<string, string> = {};
  const CHUNK = 3180;
  if (payload.length <= CHUNK) {
    cookies[name] = payload;
  } else {
    for (let i = 0; i * CHUNK < payload.length; i++) {
      cookies[`${name}.${i}`] = payload.slice(i * CHUNK, (i + 1) * CHUNK);
    }
  }
  return cookies;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ── Sections d'audit ─────────────────────────────────────────────────────────

async function auditPublicPages() {
  const pages: Array<[string, RegExp]> = [
    ["/", /agent|Prompta/i],
    ["/pricing", /Découverte|Starter|Pro/i],
    ["/login", /connexion|login|email/i],
    ["/signup", /inscri|signup|email/i],
    ["/sitemap.xml", /urlset|sitemap/i],
    ["/robots.txt", /User-agent/i],
    ["/aide", /Questions fréquentes/i],
    ["/cas-usage", /Cas d.usage|missions concrètes/i],
    ["/cas-usage/veille-quotidienne", /veille/i],
    ["/cas-usage/relances-clients", /relance/i],
    ["/cas-usage/emails-vers-trello", /Trello/i],
    ["/cas-usage/reporting-automatique", /Sheets/i],
    ["/cas-usage/prospection-contenu", /LinkedIn/i],
  ];
  for (const [path, expect] of pages) {
    try {
      const [res, ms] = await timed(() => fetch(`${BASE_URL}${path}`, { redirect: "manual" }));
      const body = await res.text();
      const broken = /Application error|Internal Server Error|__NEXT_ERROR__/i.test(body);
      const ok = res.status === 200 && expect.test(body) && !broken;
      record(
        "Public",
        `GET ${path}`,
        ok,
        ok ? `200, contenu attendu` : `status ${res.status}${broken ? ", page d'erreur" : ""}${!expect.test(body) ? ", contenu attendu absent" : ""}`,
        ms,
      );
    } catch (e) {
      record("Public", `GET ${path}`, false, `réseau: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function auditAuthGates() {
  for (const path of ["/dashboard", "/dashboard/contenus", "/dashboard/runs", "/dashboard/connexions", "/dashboard/validations", "/admin"]) {
    try {
      const [res, ms] = await timed(() => fetch(`${BASE_URL}${path}`, { redirect: "manual" }));
      const ok = [302, 303, 307, 308].includes(res.status);
      record("Portes d'auth", `GET ${path} (anonyme)`, ok, ok ? `redirige (${res.status})` : `status ${res.status} — page accessible sans login ?!`, ms);
    } catch (e) {
      record("Portes d'auth", `GET ${path}`, false, `réseau: ${e}`);
    }
  }
}

async function auditAuthenticated(cookies: Record<string, string>) {
  const H = { cookie: cookieHeader(cookies) };

  // Pages clés connectées → 200 sans page d'erreur.
  for (const path of ["/dashboard", "/dashboard/contenus", "/dashboard/runs", "/dashboard/connexions", "/dashboard/validations", "/dashboard/abonnements", "/admin"]) {
    try {
      const [res, ms] = await timed(() => fetch(`${BASE_URL}${path}`, { headers: H, redirect: "manual" }));
      const body = res.status === 200 ? await res.text() : "";
      const broken = /Application error|Internal Server Error/i.test(body);
      const ok = res.status === 200 && !broken;
      record("Connecté", `GET ${path}`, ok, ok ? "200" : `status ${res.status}${broken ? " + page d'erreur" : ""}`, ms);
    } catch (e) {
      record("Connecté", `GET ${path}`, false, `réseau: ${e}`);
    }
  }

  // APIs de données du dashboard.
  try {
    const [res, ms] = await timed(() => fetch(`${BASE_URL}/api/composio/toolkits`, { headers: H }));
    const data = (await res.json()) as { enabled?: boolean; toolkits?: unknown[] };
    const n = data.toolkits?.length ?? 0;
    record("APIs", "GET /api/composio/toolkits", res.ok && n > 900, `${n} apps (attendu > 900)`, ms);
  } catch (e) {
    record("APIs", "GET /api/composio/toolkits", false, `${e}`);
  }
  for (const path of ["/api/keys", "/api/connectors"]) {
    try {
      const [res, ms] = await timed(() => fetch(`${BASE_URL}${path}`, { headers: H }));
      record("APIs", `GET ${path}`, res.ok, `status ${res.status}`, ms);
    } catch (e) {
      record("APIs", `GET ${path}`, false, `${e}`);
    }
  }
}

async function auditAgentLifecycle(cookies: Record<string, string>) {
  const H = { cookie: cookieHeader(cookies), "Content-Type": "application/json" };

  // 1) Génération de plan IA (le cœur du produit).
  interface GenPlan { steps?: unknown[]; title?: string; kind?: string }
  let plan: GenPlan | null = null;
  try {
    const [res, ms] = await timed(() =>
      fetch(`${BASE_URL}/api/builder/generate-plan`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({
          description:
            "Chaque lundi, cherche les 3 actualités IA les plus importantes de la semaine et envoie-moi un résumé par email.",
          modelId: "gpt-5.4-mini",
        }),
      }),
    );
    const data = (await res.json()) as { plan?: GenPlan; error?: string };
    plan = data.plan ?? null;
    const steps = plan?.steps?.length ?? 0;
    record("Builder", "POST /api/builder/generate-plan", res.ok && steps >= 2, res.ok ? `plan « ${plan?.title} », ${steps} étapes` : `status ${res.status}: ${data.error}`, ms);
  } catch (e) {
    record("Builder", "generate-plan", false, `${e}`);
  }

  // 2) Cycle de vie : créer (brouillon) → publier (porte quota) → run-version → supprimer.
  let listingId: string | null = null;
  try {
    const manifest = {
      kind: "agent",
      steps: [
        { type: "tool", tool: "web_search", params: { query: "actualités IA semaine" }, outputKey: "actus" },
        { type: "llm", model: "gpt-5.4-mini", prompt: "Résume en 3 points : {{actus}}", outputKey: "resume" },
      ],
      connectors: [],
      secrets: [],
    };
    const [res, ms] = await timed(() =>
      fetch(`${BASE_URL}/api/listings/create`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({
          title: "USER-AUDIT — agent jetable",
          type: "agent",
          description: "Agent créé par le robot d'audit — supprimé automatiquement.",
          models: ["gpt-5.4-mini"],
          techStack: [], integrations: [], tags: [],
          priceCents: 0, pricingMode: "free", subscriptionPriceCents: 0, hostingFeeCents: 0,
          provisioningMode: "manual",
          promptBody: "",
          manifest,
          setupTime: "1 min",
        }),
      }),
    );
    const data = (await res.json()) as { id?: string; error?: string; message?: string };
    listingId = data.id ?? null;
    record("Cycle de vie", "créer un agent (brouillon)", res.ok && !!listingId, res.ok ? `id ${listingId?.slice(0, 8)}` : `status ${res.status}: ${data.message ?? data.error}`, ms);
  } catch (e) {
    record("Cycle de vie", "créer un agent", false, `${e}`);
  }

  if (listingId) {
    try {
      const [res, ms] = await timed(() =>
        fetch(`${BASE_URL}/api/listings/update`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ listingId, publish: true }),
        }),
      );
      const data = (await res.json()) as { error?: string; message?: string };
      record("Cycle de vie", "mettre en production (porte quota)", res.ok, res.ok ? "publié" : `status ${res.status}: ${data.message ?? data.error}`, ms);
    } catch (e) {
      record("Cycle de vie", "publication", false, `${e}`);
    }

    try {
      const [res, ms] = await timed(() => fetch(`${BASE_URL}/api/listings/${listingId}/run-version`, { headers: H }));
      const data = (await res.json()) as { versionId?: string; error?: string };
      record("Cycle de vie", "préparer le lancement (run-version)", res.ok && !!data.versionId, res.ok ? "version prête" : `status ${res.status}: ${data.error}`, ms);
    } catch (e) {
      record("Cycle de vie", "run-version", false, `${e}`);
    }

    // Planification + webhook (P0 audité) : GET crée le trigger, POST planifie, DELETE nettoie.
    try {
      const [res, ms] = await timed(() => fetch(`${BASE_URL}/api/agents/${listingId}/schedule`, { headers: H }));
      const data = (await res.json()) as { webhook?: { url?: string } };
      record("Planification", "GET schedule (webhook créé)", res.ok && !!data.webhook?.url, res.ok ? `webhook ${data.webhook?.url?.slice(-20)}` : `status ${res.status}`, ms);
    } catch (e) {
      record("Planification", "GET schedule", false, `${e}`);
    }
    try {
      const [res, ms] = await timed(() =>
        fetch(`${BASE_URL}/api/agents/${listingId}/schedule`, {
          method: "POST",
          headers: H,
          body: JSON.stringify({ kind: "daily", time: "09:00" }),
        }),
      );
      const data = (await res.json()) as { schedule?: { label?: string; nextRunAt?: string }; error?: string };
      const ok = res.ok && !!data.schedule?.nextRunAt;
      record("Planification", "POST planning quotidien", ok, ok ? `${data.schedule?.label} → ${data.schedule?.nextRunAt}` : `status ${res.status}: ${data.error}`, ms);
    } catch (e) {
      record("Planification", "POST planning", false, `${e}`);
    }
    try {
      const [res, ms] = await timed(() => fetch(`${BASE_URL}/api/agents/${listingId}/schedule`, { method: "DELETE", headers: H }));
      record("Planification", "DELETE planning", res.ok, `status ${res.status}`, ms);
    } catch (e) {
      record("Planification", "DELETE planning", false, `${e}`);
    }

    try {
      const [res, ms] = await timed(() => fetch(`${BASE_URL}/api/listings/${listingId}`, { method: "DELETE", headers: H }));
      record("Cycle de vie", "supprimer l'agent de test", res.ok, `status ${res.status}`, ms);
    } catch (e) {
      record("Cycle de vie", "suppression", false, `${e}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`USER AUDIT — cible ${BASE_URL}\n`);

  await auditPublicPages();
  await auditAuthGates();

  let cookies: Record<string, string> | null = null;
  try {
    cookies = await mintSessionCookies();
    record("Session", "login (magiclink → cookie SSR)", true, "session émise");
  } catch (e) {
    record("Session", "login", false, `${e instanceof Error ? e.message : e}`);
  }

  if (cookies) {
    await auditAuthenticated(cookies);
    await auditAgentLifecycle(cookies);
  }

  // ── Rapport ──
  const bugs = checks.filter((c) => !c.ok);
  const lines = [
    `# User audit — ${new Date().toISOString()}`,
    `Cible : ${BASE_URL} · ${checks.length} vérifications · ${bugs.length} bug(s)`,
    "",
    "| Section | Vérification | OK | Détail | Durée |",
    "|---|---|---|---|---|",
    ...checks.map((c) => `| ${c.section} | ${c.name} | ${c.ok ? "✅" : "❌"} | ${c.detail.replace(/\|/g, "/")} | ${c.ms}ms |`),
  ];
  mkdirSync("scripts/tmp", { recursive: true });
  writeFileSync("scripts/tmp/user-audit.md", lines.join("\n") + "\n");

  console.log(`\n═══ ${checks.length} vérifications · ${bugs.length} bug(s) ═══`);
  for (const b of bugs) console.log(`✗ [${b.section}] ${b.name}: ${b.detail}`);
  console.log("Rapport : scripts/tmp/user-audit.md");
  process.exit(bugs.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("User audit — erreur fatale :", err);
  process.exit(2);
});
