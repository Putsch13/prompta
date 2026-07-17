/**
 * Batterie e2e ciblée « Prompta partout » (serveur local, session mintée).
 * Scénarios : tac au tac, sentinelle mission, clarification, connecteur
 * manquant, agent complexe sur BDD affichée, validation humaine.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./load-env";
loadEnvFiles();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const EMAIL = "puccini.f13@gmail.com";

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

const BDD = `Base produits affichée à l'écran
ID | PRODUIT | STOCK | PRIX | STATUT
1 | Clavier mécanique | 12 | 49€ | actif
2 | Souris sans fil | -3 | 19€ | actif
3 | Écran 27" | 7 | | actif
4 | Casque | 15 | 89€ | ARCHIVÉ
5 | Webcam HD | 9 | 59€ | actif
5 | Webcam HD | 4 | 59€ | actif
6 | Hub USB | 22 | 29€ | inconnu`;

let cookie = "";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

async function instant(goal: string, page?: unknown): Promise<{ text: string; mission: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/extension/instant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ goal, page }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    return { text: "", mission: false, error: `HTTP ${res.status} ${t.slice(0, 200)}` };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = ""; let text = ""; let mission = false; let error: string | undefined;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const line of buf.split("\n\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        if (ev.delta) text += ev.delta;
        if (ev.mission) mission = true;
        if (ev.error) error = ev.error;
      } catch { /* fragment incomplet */ }
    }
    const idx = buf.lastIndexOf("\n\n");
    if (idx >= 0) buf = buf.slice(idx + 2);
  }
  return { text, mission, error };
}

async function execute(goal: string, page?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/extension/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ goal, page }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

async function pollRun(runId: string, timeoutMs = 240_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/run/agent/${runId}`, { headers: { Cookie: cookie } });
    last = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const st = (last.run as Record<string, unknown> | undefined)?.status ?? last.status;
    if (["completed", "failed", "awaiting_approval", "cancelled"].includes(String(st))) return last;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { ...last, __timeout: true };
}

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name} — ${detail}`);
}

async function main() {
  cookie = await mintCookie();
  console.log("Session mintée. Base:", BASE);

  // 1. Tac au tac simple
  {
    const r = await instant("Quelle est la capitale de l'Australie ? Réponds en un mot.");
    record("instant/simple", !r.error && !r.mission && /canberra/i.test(r.text), r.error ?? r.text.slice(0, 80));
  }

  // 2. Tac au tac avec contexte page
  {
    const r = await instant("Combien de lignes ont le statut actif dans ce tableau ? Réponds par un chiffre.", { url: "https://exemple.fr/bdd", title: "BDD", content: BDD });
    record("instant/contexte-page", !r.error && !r.mission && /5|cinq/i.test(r.text), r.error ?? r.text.slice(0, 100));
  }

  // 3. Sentinelle MISSION (ordre d'action → bascule attendue)
  {
    const r = await instant("Envoie un email à jean.dupont@exemple.fr pour reporter la réunion de jeudi à vendredi.");
    record("instant/sentinelle-mission", r.mission === true, r.mission ? "bascule mission OK" : `pas de bascule — texte: ${r.text.slice(0, 80)}${r.error ?? ""}`);
  }

  // 4. Clarification (BDD ambiguë × CRM)
  {
    const r = await execute("va chercher les données clients dans la bdd et compare-les à mon CRM", { url: "https://exemple.fr", title: "Accueil", content: "Page d'accueil sans données." });
    const clar = Array.isArray(r.body.clarify) ? (r.body.clarify as string[]) : null;
    record("execute/clarification", r.status === 200 && !!clar && clar.length > 0,
      clar ? `questions: ${clar.join(" | ").slice(0, 160)}` : `status ${r.status} → ${JSON.stringify(r.body).slice(0, 160)}`);
  }

  // 5. Connecteur manquant (app à laquelle le compte n'est pas connecté)
  {
    const r = await execute("Crée une fiche contact dans mon HubSpot avec le nom Jean Dupont et l'email jean@exemple.fr");
    const missing = (r.body.missingConnectors as string[] | undefined) ?? [];
    record("execute/connecteur-manquant", r.status === 409 && missing.length > 0,
      `status ${r.status}, missing: ${missing.join(",") || JSON.stringify(r.body).slice(0, 140)}`);
  }

  // 6. Agent complexe sur BDD affichée (analyse pure, sans app externe)
  {
    const r = await execute(
      "Analyse la base produits affichée : liste les anomalies (stock négatif, prix manquant, doublons, statuts incohérents) puis rédige un rapport structuré avec recommandations.",
      { url: "https://exemple.fr/bdd", title: "Base produits", content: BDD },
    );
    if (r.status !== 200 || !r.body.runId) {
      record("execute/agent-complexe", false, `status ${r.status} → ${JSON.stringify(r.body).slice(0, 160)}`);
    } else {
      const done = await pollRun(String(r.body.runId));
      const run = (done.run ?? done) as Record<string, unknown>;
      const status = String(run.status ?? "?");
      const output = JSON.stringify(run.output ?? {});
      const mentions = /-3|négatif/i.test(output) && /doublon|webcam/i.test(output);
      record("execute/agent-complexe", status === "completed" && mentions,
        `status ${status}, anomalies détectées: ${mentions}, output: ${output.slice(0, 120)}…`);
    }
  }

  // 7. Validation humaine (écriture sensible → awaiting_approval, puis refus propre)
  {
    const r = await execute(
      `Rédige un email de synthèse de la base produits affichée et envoie-le à ${EMAIL}.`,
      { url: "https://exemple.fr/bdd", title: "Base produits", content: BDD },
    );
    if (r.status !== 200 || !r.body.runId) {
      record("execute/validation-humaine", false, `status ${r.status} → ${JSON.stringify(r.body).slice(0, 160)}`);
    } else {
      const done = await pollRun(String(r.body.runId), 180_000);
      const run = (done.run ?? done) as Record<string, unknown>;
      const status = String(run.status ?? "?");
      if (status !== "awaiting_approval") {
        record("execute/validation-humaine", false, `status ${status} (attendu awaiting_approval)`);
      } else {
        // Refus propre pour ne pas envoyer d'email réel depuis le local.
        const ap = await fetch(`${BASE}/api/approvals`, { headers: { Cookie: cookie } }).then((x) => x.json());
        const item = (ap.items ?? ap ?? []).find?.((a: Record<string, unknown>) => {
          const rr = a.run as Record<string, unknown> | undefined;
          return a.runId === r.body.runId || rr?.id === r.body.runId || a.run_id === r.body.runId;
        }) ?? (ap.items ?? [])[0];
        const dec = await fetch(`${BASE}/api/run/agent/${r.body.runId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ approvalId: item?.id, decision: "rejected", approved: false }),
        });
        record("execute/validation-humaine", true, `awaiting_approval OK, refus → HTTP ${dec.status}`);
      }
    }
  }

  console.log("\n=== BILAN ===");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail.slice(0, 200)}`);
  const fails = results.filter((r) => !r.ok).length;
  console.log(`${results.length - fails}/${results.length} PASS`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
