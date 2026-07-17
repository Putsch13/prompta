/**
 * QA OMNISCIENCE & CONTRÔLE — prouve que l'assistant lit et croise PLUSIEURS
 * onglets/sites ouverts (avec la session utilisateur), pose des questions quand
 * il doute, et gère les cas complexes sans crasher.
 *
 * Chaque cas fournit un contexte multi-onglets réaliste via page.openTabs[].
 * On mesure : réponse pertinente (instant) ou run mené à terme (execute), et
 * on détecte les crashs (422/500, run failed, timeout).
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

let cookie = "";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function rec(name: string, ok: boolean, detail: string) { results.push({ name, ok, detail }); console.log(`${ok ? "✅" : "❌"} ${name} — ${detail.slice(0, 150)}`); }

async function instant(goal: string, page: unknown): Promise<{ text: string; mission: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/extension/instant`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ goal, page }) });
  if (!res.ok || !res.body) return { text: "", mission: false, error: `HTTP ${res.status} ${(await res.text().catch(()=>"")).slice(0,120)}` };
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = "", text = "", mission = false, error: string | undefined; const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    for (const line of buf.split("\n\n")) { if (!line.startsWith("data: ")) continue; try { const ev = JSON.parse(line.slice(6)); if (ev.delta) text += ev.delta; if (ev.mission) mission = true; if (ev.error) error = ev.error; } catch {} }
    const idx = buf.lastIndexOf("\n\n"); if (idx >= 0) buf = buf.slice(idx + 2); }
  return { text, mission, error };
}
async function execute(goal: string, page: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/api/extension/execute`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ goal, page }) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
async function pollRun(runId: string, timeoutMs = 220_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs; let last: Record<string, unknown> = {};
  while (Date.now() < deadline) { const res = await fetch(`${BASE}/api/run/agent/${runId}`, { headers: { Cookie: cookie } }); last = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const st = (last.run as Record<string, unknown> | undefined)?.status ?? last.status;
    if (["completed", "failed", "awaiting_approval", "cancelled"].includes(String(st))) return last; await new Promise(r => setTimeout(r, 4000)); }
  return { ...last, __timeout: true };
}
const tab = (url: string, title: string, content: string) => ({ url, title, content });

async function main() {
  cookie = await mintCookie();
  console.log("OMNISCIENCE — base:", BASE, "\n");

  // Jeux de données multi-sites cohérents
  const CRM = tab("https://crm.exemple.fr/contacts", "CRM — Contacts", `CRM PIPEDRIVE — Deals ouverts\nSociété | Contact | Montant | Étape | Dernier contact\nAcme SA | Marie Leroy | 12000€ | Négociation | 2026-07-02\nBeta SARL | Paul Girard | 4500€ | Proposition | 2026-06-28\nGamma Inc | Lena Ba | 30000€ | Découverte | 2026-07-10\nDelta Co | Tom Rey | 8000€ | Négociation | 2026-05-15`);
  const SHEET = tab("https://docs.google.com/spreadsheets/d/xyz", "Prévisions Q3 - Sheets", `Prévisions CA Q3\nSociété | CA prévu | Probabilité\nAcme SA | 12000 | 80%\nBeta SARL | 4500 | 50%\nGamma Inc | 30000 | 30%\nEpsilon | 15000 | 90%`);
  const MAIL = tab("https://mail.google.com/mail/u/0", "Boîte Gmail", `Gmail — 3 non lus\nDe: Marie Leroy (Acme) — "Re: contrat" — "On valide, envoyez le devis final"\nDe: Tom Rey (Delta) — "Annulation" — "On ne donne pas suite, désolé"\nDe: compta@beta.fr — "Facture en retard" — "Relance facture 2043, 4500€"`);
  const ANALYTICS = tab("https://analytics.exemple.fr", "Analytics", `Trafic 7 jours\nSource | Visites | Conversions\nGoogle | 3200 | 48\nDirect | 1100 | 22\nLinkedIn | 640 | 19\nInstagram | 2800 | 3`);
  const YT = tab("https://youtube.com/watch?v=abc", "YouTube — Conférence IA", `Titre: L'avenir des agents IA (42 min)\nChapitres: 0:00 Intro, 5:30 Outils, 18:00 Sécurité, 31:00 Coûts, 40:00 Q&R\nDescription: panorama des agents autonomes en entreprise en 2026.`);
  const DOC = tab("https://notion.so/notes", "Notes réunion - Notion", `Réunion commerciale 15/07\n- Objectif trimestre: 50k€\n- Prioriser Gamma Inc (gros potentiel)\n- Relancer les deals en négociation\n- Delta: à surveiller, risque de churn`);

  // 1. Croisement CRM × Sheet : incohérences entre deux sources
  { const r = await instant("Compare les montants de mes deals dans le CRM (onglet 1) avec les prévisions du Sheet (onglet 2). Quelles sociétés sont dans les deux, et où les chiffres divergent ?", { url: CRM.url, title: CRM.title, content: CRM.content, openTabs: [CRM, SHEET] });
    const ok = !r.error && /acme|beta|gamma/i.test(r.text) && /(epsilon|delta|absent|manqu|diverg|uniquement)/i.test(r.text); rec("multi/CRM×Sheet croisement", ok, r.error ?? r.text); }

  // 2. Trois onglets : CRM × Sheet × Mail — synthèse d'action
  { const r = await instant("En croisant mon CRM, mes prévisions et ma boîte mail (3 onglets), quels deals dois-je traiter en priorité aujourd'hui et pourquoi ?", { url: MAIL.url, title: MAIL.title, content: MAIL.content, openTabs: [CRM, SHEET, MAIL] });
    const ok = !r.error && /acme/i.test(r.text) && /(delta|annul|churn)/i.test(r.text); rec("multi/3-onglets synthèse action", ok, r.error ?? r.text); }

  // 3. Preuve d'omniscience : compter/agréger à travers les onglets
  { const r = await instant("Fais la somme totale des montants de deals ouverts visibles dans mon CRM (onglet 1). Donne le total en euros.", { url: CRM.url, title: CRM.title, content: CRM.content, openTabs: [CRM] });
    const ok = !r.error && /54\s?500|54500/i.test(r.text.replace(/\s/g, "")); rec("multi/agrégation exacte CRM", ok, r.error ?? r.text); }

  // 4. Analytics : trouver l'anomalie de conversion
  { const r = await instant("Dans cet onglet analytics, quelle source a le pire taux de conversion et lequel ?", { url: ANALYTICS.url, title: ANALYTICS.title, content: ANALYTICS.content, openTabs: [ANALYTICS] });
    const ok = !r.error && /instagram/i.test(r.text); rec("multi/analytics anomalie", ok, r.error ?? r.text); }

  // 5. YouTube : Q sur le contenu d'une vidéo ouverte
  { const r = await instant("D'après l'onglet YouTube ouvert, à quelle minute commence la partie sur la sécurité ?", { url: YT.url, title: YT.title, content: YT.content, openTabs: [YT] });
    const ok = !r.error && /18|dix-huit/i.test(r.text); rec("multi/youtube chapitre", ok, r.error ?? r.text); }

  // 6. Contradiction entre deux onglets (mail annule un deal du CRM)
  { const r = await instant("Y a-t-il une contradiction entre mon CRM (onglet 1) et mes emails (onglet 2) ? Si oui, laquelle ?", { url: CRM.url, title: CRM.title, content: CRM.content, openTabs: [CRM, MAIL] });
    const ok = !r.error && /delta/i.test(r.text) && /(annul|churn|abandon|ne donne pas suite|ferm)/i.test(r.text); rec("multi/contradiction CRM×mail", ok, r.error ?? r.text); }

  // 7. Priorisation guidée par les notes Notion + CRM
  { const r = await instant("En tenant compte de mes notes de réunion (Notion) et de mon CRM, quelle société est ma priorité n°1 et est-ce cohérent avec l'état du deal ?", { url: DOC.url, title: DOC.title, content: DOC.content, openTabs: [DOC, CRM] });
    const ok = !r.error && /gamma/i.test(r.text); rec("multi/notes×CRM priorité", ok, r.error ?? r.text); }

  // 8. MISSION complexe multi-source → livrable (execute, run complet)
  { const r = await execute("Croise mon CRM, mes prévisions Sheet et mes notes Notion (3 onglets), puis rédige une synthèse commerciale structurée : deals prioritaires, risques de churn, écarts prévisions/CRM, et 3 actions recommandées.", { url: CRM.url, title: CRM.title, content: CRM.content, openTabs: [CRM, SHEET, DOC] });
    if (r.status !== 200 || !r.body.runId) rec("multi/mission-synthèse-complexe", false, `status ${r.status} ${JSON.stringify(r.body).slice(0,120)}`);
    else { const done = await pollRun(String(r.body.runId)); const run = (done.run ?? done) as Record<string, unknown>; const out = JSON.stringify(run.output ?? {});
      const ok = String(run.status) === "completed" && /gamma/i.test(out) && /(delta|churn)/i.test(out); rec("multi/mission-synthèse-complexe", ok, `status ${run.status} ${out.slice(0,120)}`); } }

  // 9. Contrôle : demande absurde/impossible → refuse proprement, pas de hallucination
  { const r = await instant("Quelle est la couleur préférée du PDG d'Acme d'après mon CRM ?", { url: CRM.url, title: CRM.title, content: CRM.content, openTabs: [CRM] });
    const ok = !r.error && /(pas|aucun|non|impossible|ne .* pas|figure pas|information)/i.test(r.text); rec("contrôle/anti-hallucination", ok, r.error ?? r.text); }

  // 10. Mission écriture sensible multi-onglet → validation humaine
  { const r = await execute(`À partir de l'email d'Acme (onglet mail) qui demande le devis final, rédige un email de réponse professionnel à Marie Leroy et envoie-le à ${EMAIL}.`, { url: MAIL.url, title: MAIL.title, content: MAIL.content, openTabs: [MAIL, CRM] });
    if (r.status !== 200 || !r.body.runId) rec("contrôle/écriture→validation", false, `status ${r.status} ${JSON.stringify(r.body).slice(0,120)}`);
    else { const done = await pollRun(String(r.body.runId), 180_000); const run = (done.run ?? done) as Record<string, unknown>;
      const ok = String(run.status) === "awaiting_approval"; if (ok) { const ap = await fetch(`${BASE}/api/approvals`, { headers: { Cookie: cookie } }).then(x=>x.json()).catch(()=>({}));
        const item = (ap.items ?? [])[0]; await fetch(`${BASE}/api/run/agent/${r.body.runId}/approve`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ approvalId: item?.id, decision: "rejected" }) }); }
      rec("contrôle/écriture→validation", ok, `status ${run.status}`); } }

  // 11. Grosse charge : 5 onglets d'un coup, extraction ciblée
  { const r = await instant("Parmi mes 5 onglets ouverts, dans lequel se trouve une info sur un churn/annulation client, et quel client ?", { url: CRM.url, title: CRM.title, content: CRM.content, openTabs: [CRM, SHEET, MAIL, ANALYTICS, DOC] });
    const ok = !r.error && /delta/i.test(r.text); rec("multi/5-onglets extraction ciblée", ok, r.error ?? r.text); }

  // 12. Robustesse : onglet vide + ordre qui vise la page active
  { const r = await instant("Résume en 2 points ce que je vois sur cette page.", { url: DOC.url, title: DOC.title, content: DOC.content, openTabs: [DOC, tab("https://vide.fr","Vide","")] });
    const ok = !r.error && /(50|gamma|delta|objectif|réunion)/i.test(r.text); rec("robustesse/onglet-vide+page-active", ok, r.error ?? r.text); }


  // 13. CONTINUITÉ : correction d'une mission précédente (scénario PagesJaunes)
  {
    const SHEETS = tab("https://docs.google.com/spreadsheets/d/1DAbx/edit", "Feuille de calcul - Google Sheets",
      "Feuille1\nNom | Ville | Téléphone\nL'Atelier de Plomberie | Marseille | 04.13.94.09.32\nAlpha Plomberie | Marseille |\nSanit Chauffage | Marseille |\nJC Plomberie | Marseille |");
    const PJ = tab("https://www.pagesjaunes.fr/recherche/marseille-13/plombiers", "Plombiers à Marseille - PagesJaunes",
      "PagesJaunes — plombiers Marseille\nL'Atelier de Plomberie — Marseille — 04 13 94 09 32\nAlpha Plomberie — Marseille — [Afficher le numéro]\nSanit Chauffage — Marseille — [Afficher le numéro]\nJC Plomberie — Marseille — [Afficher le numéro]");
    const historique = [
      { role: "user", content: "peux-tu me faire un tableau dans l'excel ouvert et recenser les plombiers nom ville téléphone dedans (grâce au site des pages jaunes sur la droite)" },
      { role: "assistant", content: "[Mission « Recenser les plombiers dans le Sheet » — statut : completed] Ajout de 6 contacts de plomberie au Google Sheets, avec un numéro renseigné uniquement pour L'Atelier de Plomberie, les numéros des autres entrées étant absents du contenu source." },
    ];
    const res = await fetch(`${BASE}/api/extension/execute`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        goal: "attention ton agent ne m'a pas recensé tous les numéros, hésite pas à cliquer sur afficher le numéro pour les recenser dans l'excel",
        page: { url: SHEETS.url, title: SHEETS.title, content: SHEETS.content, openTabs: [SHEETS, PJ] },
        history: historique,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status !== 200 || !body.runId) {
      rec("continuité/correction→plan ciblé", false, `status ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    } else {
      // Le plan doit contenir une étape browser avec tabHint vers PagesJaunes.
      const { data: run } = await sb.from("listing_agent_runs").select("inputs").eq("id", String(body.runId)).single();
      const manifest = JSON.parse(((run?.inputs as Record<string, string>)?.__manifest) ?? "{}");
      const steps = (manifest.steps ?? []) as Array<Record<string, unknown>>;
      const browserStep = steps.find((st) => st.type === "browser");
      const hint = String(browserStep?.tabHint ?? "").toLowerCase();
      const ok = !!browserStep && (hint.includes("pagesjaunes") || hint.includes("pages jaunes") || hint.includes("plombier"));
      rec("continuité/correction→plan ciblé", ok,
        browserStep ? `browser step, tabHint="${browserStep.tabHint ?? "(absent)"}" pilots=${body.pilots}` : `pas d'étape browser — steps: ${steps.map((st) => st.type).join(",")}`);
      // Pas d'extension ici pour exécuter le pilotage : on annule proprement.
      await sb.from("listing_agent_runs").update({ status: "cancelled", error_message: "QA plan-check" }).eq("id", String(body.runId));
    }
  }

  // 14. CONTINUITÉ instant : question de suivi qui référence la réponse précédente
  {
    const r = await instant("et en pourcentage du total, ça représente combien ?", {
      url: CRM.url, title: CRM.title, content: CRM.content, openTabs: [CRM],
      // l'historique passe par le body instant (déjà supporté)
    });
    // NB: l'API instant lit history dans le body — on refait l'appel complet :
    const res = await fetch(`${BASE}/api/extension/instant`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        goal: "et en pourcentage du total, ça représente combien ?",
        page: { url: CRM.url, title: CRM.title, content: CRM.content },
        history: [
          { role: "user", content: "Quel est le montant du deal Gamma Inc dans mon CRM ?" },
          { role: "assistant", content: "Le deal Gamma Inc est de 30000€ (étape Découverte)." },
        ],
      }),
    });
    let text = ""; let err;
    if (res.ok && res.body) {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
        for (const line of buf.split("\n\n")) { if (!line.startsWith("data: ")) continue; try { const ev = JSON.parse(line.slice(6)); if (ev.delta) text += ev.delta; if (ev.error) err = ev.error; } catch {} }
        const i = buf.lastIndexOf("\n\n"); if (i >= 0) buf = buf.slice(i + 2); }
    } else err = `HTTP ${res.status}`;
    void r;
    // 30000 / 54500 ≈ 55 %
    const ok = !err && /5[3-8]([.,]\d+)?\s?%/.test(text) && /(54|52)\s?500/.test(text.replace(/ | /g, ' '));
    rec("continuité/instant follow-up", ok, err ?? text.slice(0, 150));
  }

  console.log("\n=== BILAN OMNISCIENCE ===");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} PASS`);
  if (fails.length) { console.log("\nÉCHECS (détail):"); for (const f of fails) console.log(`- ${f.name}: ${f.detail.slice(0, 300)}`); }
}
main().catch(e => { console.error("FATAL", e); process.exit(1); });
