/**
 * Prompta — assistant du quotidien (popup barre d'outils).
 *
 * UN cerveau, DEUX régimes (mêmes que la barre in-page) :
 *  - TAC AU TAC : réponse streamée token par token (port SSE via le worker) ;
 *  - MISSION : bascule automatique → capture des onglets cochés AVEC session,
 *    plan agent, run live, validations humaines, re-planification auto.
 */

let baseUrl = "https://prompta-sjtf.onrender.com";
let pollTimer = null;
let launching = false;
let pendingClarify = null; // { goal } en attente de précisions
let clarifyQ = null;       // questions à afficher
let activePage = null;   // capture de l'onglet actif
let openTabs = [];       // [{title, url, checked}]
let session = [];        // échanges instantanés terminés (cette session popup)

const $ = (id) => document.getElementById(id);
const feed = $("feed");
const goalEl = $("goal");
const sendBtn = $("send");
const modelEl = $("model");
const chipsBox = $("chips");
const connsBox = $("conns");
const tabsList = $("tabs-list");
const tabsActions = $("tabs-actions");
const ctxHead = $("ctx-head");
const ctxSummary = $("ctx-summary");
const alltabsEl = $("alltabs");
const exploreEl = $("explore");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Réponse texte d'une mission simple : la clé "reponse" sinon le 1er output. */
function extractAnswer(output) {
  if (!output || typeof output !== "object") return null;
  if (typeof output.reponse === "string") return output.reponse;
  if (typeof output.result === "string") return output.result;
  const vals = Object.entries(output).filter(([k, v]) => !k.startsWith("__") && !k.endsWith("_output") && typeof v === "string");
  return vals.length ? vals[vals.length - 1][1] : null;
}
const send = (type, extra) => new Promise((res) => chrome.runtime.sendMessage({ type, ...extra }, (r) => res(r || { ok: false, status: 0, body: {} })));

// ── Capture ─────────────────────────────────────────────────────────────────
function pageCaptureFn(allowExplore, maxContent, maxLinks) {
  const isPdf = document.contentType === "application/pdf";
  let content;
  try {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,svg,nav,footer,aside,header,iframe").forEach((n) => n.remove());
    content = isPdf ? undefined : (clone.innerText || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, maxContent);
  } catch { content = ""; }
  let links;
  if (allowExplore && !isPdf) {
    const seen = new Set(); links = [];
    for (const a of document.querySelectorAll("a[href]")) {
      if (links.length >= maxLinks) break;
      try {
        const href = new URL(a.getAttribute("href"), location.href).toString();
        if (!/^https?:/.test(href) || href === location.href || seen.has(href)) continue;
        seen.add(href);
        const label = (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70);
        links.push(label ? `${label} → ${href}` : href);
      } catch { /* href invalide */ }
    }
  }
  return { url: location.href, title: document.title || "", selection: String(window.getSelection() || "").trim().slice(0, 4000) || undefined, content, links, isPdf };
}

async function captureActivePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const base = { url: tab?.url || "", title: tab?.title || "" };
  if (!tab?.id || !/^https?:|^file:/.test(tab.url || "")) return { ...base, unsupported: true };
  try {
    const [inj] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageCaptureFn, args: [exploreEl.checked, 15000, 40] });
    return inj?.result ?? { ...base, unsupported: true };
  } catch { return { ...base, unsupported: true }; }
}

async function collectTabs() {
  if (!alltabsEl.checked) return [];
  try {
    const tabs = await chrome.tabs.query({});
    const seen = new Set(); const out = [];
    for (const t of tabs) {
      const u = t.url || "";
      if (!/^https?:/.test(u) || seen.has(u)) continue;
      seen.add(u);
      out.push({ title: t.title || "", url: u, checked: true });
      if (out.length >= 30) break;
    }
    return out;
  } catch { return []; }
}

// ── Rendu contexte ────────────────────────────────────────────────────────────
function renderContext() {
  const p = activePage;
  const checked = openTabs.filter((t) => t.checked).length;
  ctxSummary.textContent = `Ce que je vois${openTabs.length ? ` · ${checked}/${openTabs.length} onglets` : ""}`;
  chipsBox.innerHTML =
    (p ? `<span class="chip">📄 ${esc((p.title || p.url || "page active").slice(0, 40))}</span>` : "") +
    (p?.isPdf ? `<span class="chip">PDF</span>` : "") +
    (p?.selection ? `<span class="chip">✂️ sélection</span>` : "") +
    (p?.unsupported ? `<span class="chip" style="color:var(--amber)">page active non lisible</span>` : "");
  tabsActions.style.display = openTabs.length ? "flex" : "none";
  tabsList.innerHTML = openTabs
    .map((t, i) => `<div class="tab-row"><input type="checkbox" data-i="${i}" ${t.checked ? "checked" : ""}><label title="${esc(t.url)}">${esc(t.title || t.url)}</label></div>`)
    .join("");
  tabsList.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", (e) => { openTabs[+e.target.dataset.i].checked = e.target.checked; renderContext(); });
  });
}

// ── Rendu conversation ──────────────────────────────────────────────────────
function statusLabel(s) {
  return { completed: "terminé", failed: "échec", awaiting_approval: "à valider", running: "en cours", pending: "en file", streaming: "répond…" }[s] || s;
}
function msgCard(item, liveSteps) {
  const model = item.model ? ` · ${esc(item.model)}` : "";
  // Un run refusé AVANT création (connecteur manquant, clarification…) a un
  // runId placeholder « … » : aucun lien dossier ne doit pointer dessus.
  const hasRun = item.runId && item.runId !== "…";
  let body = "";
  if (item.status === "streaming" && !item.answer) body += `<div class="think"><span class="orb"></span> Prompta réfléchit…</div>`;
  if (liveSteps && liveSteps.length) {
    body += `<div class="steps">${liveSteps.map((label, i) => {
      const done = item.stepsCompleted ?? 0;
      const ic = i < done ? "✓" : i === done && (item.status === "running" || item.status === "pending") ? "▶" : "·";
      return `<div class="step"><span class="ic ${i < done ? "ok" : ""}">${ic}</span><span>${esc(label)}</span></div>`;
    }).join("")}</div>`;
  } else if (liveSteps && (item.status === "running" || item.status === "pending")) {
    body += `<div class="think"><span class="orb"></span> Prompta conçoit l'agent…</div>`;
  }
  let footer = "";
  if (item.answer) footer += `<div class="answer" style="margin-top:8px;color:var(--ink);white-space:pre-wrap">${esc(item.answer).slice(0, 12000)}${item.status === "streaming" ? '<span class="caret"></span>' : ""}</div>`;
  if (item.status === "awaiting_approval") {
    const validateUrl = item.approvalId
      ? `${baseUrl}/dashboard/validations?focus=${esc(item.approvalId)}`
      : `${baseUrl}/dashboard/validations`;
    footer += `<div class="warn" style="margin-top:6px">⏸ <a href="${validateUrl}" target="_blank" rel="noopener">valider dans Prompta</a></div>`;
  } else if (item.status === "completed" && hasRun) footer += `<div style="margin-top:6px"><a href="${baseUrl}/dashboard/runs/${esc(item.runId)}" target="_blank" rel="noopener">voir le dossier ↗</a></div>`;
  else if (item.status === "failed") {
    const detailLink = hasRun ? ` — <a href="${baseUrl}/dashboard/runs/${esc(item.runId)}" target="_blank" rel="noopener">détails</a>` : "";
    const connectLink = item.needsConnect ? ` — <a href="${baseUrl}/dashboard/connexions" target="_blank" rel="noopener">connecter ↗</a>` : "";
    footer += `<div class="err" style="margin-top:6px">✗ ${esc(item.error || "Échec")}${connectLink}${detailLink}</div>`;
  }
  const cancelBtn = liveSteps && hasRun && (item.status === "running" || item.status === "pending")
    ? `<button class="mact" data-cancel="${esc(item.runId)}" style="margin-left:auto">■ stop</button>`
    : "";
  const saveBtn = hasRun && item.status === "completed" && (item.stepsCompleted ?? 0) > 1 && !item.instant && !item.savedAgent
    ? `<button class="mact" data-save="${esc(item.runId)}">💾 garder comme agent</button>` : "";
  const savedNote = item.savedAgent ? `<a href="${esc(item.savedAgent)}" target="_blank" rel="noopener">agent enregistré ↗</a>` : "";
  return `<div class="msg" data-run="${esc(item.runId || "")}">
    <div class="goal">${esc(item.goal || item.title || "Mission")}</div>
    ${body}${footer}
    <div class="meta"><span class="dot s-${esc(item.status)}"></span>${statusLabel(item.status)}${model}${saveBtn}${savedNote}${cancelBtn}</div>
  </div>`;
}
let history = [];
let current = null; // { kind, runId, goal, model, status, stepsCompleted, error, planned, answer }
const SUGGESTIONS = [
  "Résume cette page en 5 points",
  "Compare mes onglets ouverts",
  "Rédige un email pro à partir de ma sélection",
];
function emptyState() {
  return `<div class="empty"><span style="font-size:14px;color:var(--soft);font-weight:600">Ton assistant, partout.</span><br>Réponse immédiate aux questions,<br>agent complet pour les missions.<br><br>${SUGGESTIONS.map((s) => `<button class="sugg" data-suggest="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
}
function renderFeed() {
  const seen = new Set(history.map((h) => (h.goal || "").slice(0, 200)));
  const localItems = session.filter((s) => !seen.has((s.goal || "").slice(0, 200)));
  const items = [...history, ...localItems];
  const list = items.map((it) => msgCard(it)).join("");
  const cur = current ? msgCard(current, current.kind === "mission" ? (current.planned || []) : null) : "";
  const clar = clarifyQ && clarifyQ.length
    ? `<div class="msg"><div class="goal" style="font-weight:600">Quelques précisions pour bien faire :</div><ul style="margin:6px 0 0;padding-left:18px;color:var(--soft)">${clarifyQ.map((q) => `<li>${esc(q)}</li>`).join("")}</ul><div style="color:var(--faint);font-size:11px;margin-top:6px">Réponds ci-dessous, je m'occupe du reste.</div></div>`
    : "";
  feed.innerHTML = (list + cur + clar) || emptyState();
  feed.querySelectorAll("[data-suggest]").forEach((b) => b.addEventListener("click", () => { goalEl.value = b.dataset.suggest; goalEl.focus(); }));
  feed.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    await send("prompta:cancel", { runId: b.dataset.cancel });
  }));
  feed.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true; b.textContent = "…";
    const r = await send("prompta:save-agent", { runId: b.dataset.save });
    if (r?.ok && r.body?.url) {
      const target = [...history, ...session, current].find((x) => x && x.runId === b.dataset.save);
      if (target) target.savedAgent = baseUrl + r.body.url;
      renderFeed();
    } else { b.disabled = false; b.textContent = "💾 garder comme agent"; }
  }));
  feed.scrollTop = feed.scrollHeight;
}

async function loadHistory() {
  const r = await send("prompta:history");
  if (r?.ok && Array.isArray(r.body.items)) {
    // Ordre chronologique (ancien → récent) pour un fil de conversation.
    history = r.body.items.slice().reverse().filter((it) => !current || it.runId !== current.runId);
    renderFeed();
  }
}

// ── Modèles ─────────────────────────────────────────────────────────────────
async function loadModels() {
  const r = await send("prompta:models");
  const { promptaModel } = await chrome.storage.sync.get("promptaModel");
  if (!r?.ok || !Array.isArray(r.body.models)) { modelEl.innerHTML = `<option value="">défaut</option>`; return; }
  const models = r.body.models;
  const firstUsable = models.find((m) => m.usable);
  // Aucun modèle utilisable → option « défaut serveur » (value vide) pour ne
  // jamais envoyer l'id d'un modèle désactivé (503 opaque garanti sinon).
  const defaultOpt = firstUsable ? "" : `<option value="">Modèle par défaut</option>`;
  modelEl.innerHTML = defaultOpt + models
    .map((m) => `<option value="${esc(m.id)}" ${m.usable ? "" : "disabled"}>${esc(m.label)}${m.usable ? "" : " (clé requise)"}</option>`)
    .join("");
  const chosen = models.find((m) => m.id === promptaModel && m.usable) ? promptaModel : (firstUsable?.id ?? "");
  modelEl.value = chosen;
}
modelEl.addEventListener("change", () => chrome.storage.sync.set({ promptaModel: modelEl.value }));

// ── Connexions ──────────────────────────────────────────────────────────────
async function loadConns() {
  const r = await send("prompta:connections");
  if (!r?.ok) { connsBox.innerHTML = `<span class="chip" style="color:var(--amber)">${r?.status === 401 ? "connecte-toi à Prompta" : "connexions indispo"}</span>`; return; }
  const seen = new Set();
  const usable = (r.body.connections || []).filter((c) => { const k = c.connectorId.toLowerCase().replace(/[^a-z0-9]/g, ""); if (seen.has(k)) return false; seen.add(k); return c.usable; });
  connsBox.innerHTML = usable.map((c) => `<span class="conn"><span class="dot s-completed"></span>${esc(c.connectorId)}</span>`).join("")
    + `<a href="${baseUrl}/dashboard/connexions" target="_blank" rel="noopener" class="conn" style="color:var(--accent)">+ connecter</a>`;
}

// ── Exécution ───────────────────────────────────────────────────────────────
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

function pollRun() {
  stopPolling();
  let errStreak = 0;
  pollTimer = setInterval(async () => {
    const r = await send("prompta:status", { runId: current.runId });
    if (!r?.ok || !r.body) {
      if (++errStreak >= 5) { stopPolling(); current.status = "failed"; current.error = r?.status === 401 ? "session expirée" : "serveur injoignable"; renderFeed(); launching = false; sendBtn.disabled = false; }
      return;
    }
    errStreak = 0;
    current.status = r.body.status;
    current.stepsCompleted = r.body.steps_completed ?? 0;
    current.planned = r.body.planned_steps?.length ? r.body.planned_steps : current.planned;
    current.error = r.body.error_message;
    current.answer = extractAnswer(r.body.output);
    current.approvalId = r.body.approval_id ?? null;
    // Tâche de pilotage en attente : (ré)armer le service worker — couvre le
    // redémarrage du worker ET un plan réparé qui introduit du pilotage.
    if (r.body.browser_task) armPilot(current.runId);
    renderFeed();
    // awaiting_approval est TERMINAL pour le poll : la validation se fait dans
    // le dashboard — sinon le composer reste bloqué indéfiniment.
    if (["completed", "failed", "cancelled", "awaiting_approval"].includes(r.body.status)) {
      stopPolling(); launching = false; sendBtn.disabled = false;
      loadHistory(); // le run terminé (et sa réponse) rejoint le fil
    }
  }, 2500);
}

/** Bascule mission : capture des onglets cochés (session incluse) puis pipeline agent. */
async function launchMission(goal) {
  current = { kind: "mission", runId: "…", goal, model: modelEl.value || null, status: "pending", stepsCompleted: 0, planned: [] };
  renderFeed();
  activePage = await captureActivePage();
  const page = { ...activePage };
  if (!exploreEl.checked) page.links = undefined;
  const targeted = openTabs.filter((t) => t.checked).map((t) => ({ title: t.title, url: t.url }));
  if (targeted.length) {
    const cap = await send("prompta:tabcontents", { urls: targeted.map((t) => t.url), maxTabs: 8, maxChars: 8000 });
    page.openTabs = (cap?.ok && Array.isArray(cap.tabs) ? cap.tabs : targeted).filter((t) => t.url !== page.url);
  }

  const r = await send("prompta:execute", { payload: { goal, page, modelId: modelEl.value || undefined } });
  if (r?.ok && Array.isArray(r.body?.clarify) && r.body.clarify.length) {
    launching = false; sendBtn.disabled = false;
    pendingClarify = { goal }; clarifyQ = r.body.clarify; current = null;
    renderFeed(); goalEl.focus(); return;
  }
  if (!r?.ok) {
    launching = false; sendBtn.disabled = false;
    if (r?.status === 409 && r.body?.missingConnectors?.length) {
      current.status = "failed";
      current.error = `À connecter : ${r.body.missingConnectors.join(", ")}`;
      current.needsConnect = true;
    } else {
      current.status = "failed";
      current.error = r?.body?.message || (r?.status === 401 ? "Connecte-toi à Prompta." : `Erreur ${r?.status || "réseau"}`);
    }
    renderFeed();
    return;
  }
  current.runId = r.body.runId;
  current.title = r.body.title;
  current.status = "running";
  // Mission avec pilotage : le service worker exécutera les actions de l'agent
  // dans l'onglet actif (celui que l'utilisateur regarde).
  if (r.body.pilots) armPilot(current.runId);
  renderFeed();
  pollRun();
}

async function armPilot(runId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await send("prompta:pilot-watch", { runId, tabId: tab.id });
  } catch { /* pas d'onglet pilotable */ }
}

/** Tac au tac streamé ; bascule automatiquement en mission si le modèle le décide. */
function launchInstant(goal, page) {
  current = { kind: "instant", goal, model: modelEl.value || null, status: "streaming", answer: "" };
  renderFeed();
  const hist = [];
  for (const it of [...history, ...session].slice(-6)) {
    if (it.goal && it.answer && it.status === "completed") {
      hist.push({ role: "user", content: it.goal }, { role: "assistant", content: it.answer });
    }
  }
  const port = chrome.runtime.connect({ name: "prompta:instant" });
  let closed = false;
  const finish = (fail, msg) => {
    if (closed) return; closed = true;
    try { port.disconnect(); } catch { /* déjà fermé */ }
    launching = false; sendBtn.disabled = false;
    if (fail) { current.status = "failed"; current.error = msg || "Réponse interrompue."; }
    else if (current.answer) { current.status = "completed"; session.push(current); current = null; }
    else { current = null; }
    renderFeed();
  };
  port.onMessage.addListener((m) => {
    if (m?.delta) { current.answer += m.delta; renderFeed(); }
    else if (m?.mission) { closed = true; try { port.disconnect(); } catch { /* */ } launchMission(goal); }
    else if (m?.done) finish(false);
    else if (m?.error) finish(true, m.error + (m.status === 401 ? " — connecte-toi à Prompta." : ""));
    else if (m?.closed && !closed) finish(current.answer ? false : true, "Connexion interrompue.");
  });
  port.onDisconnect.addListener(() => { if (!closed) finish(current?.answer ? false : true, "Connexion interrompue."); });
  port.postMessage({ type: "start", payload: { goal, page, modelId: modelEl.value || undefined, history: hist.slice(-6) } });
}

async function launch() {
  if (launching) return;
  let goal = goalEl.value.trim();
  if (goal.length < 2) return;
  launching = true; sendBtn.disabled = true;
  goalEl.value = ""; goalEl.style.height = "auto";
  if (pendingClarify) {
    goal = `${pendingClarify.goal}\n\nPrécisions de l'utilisateur : ${goal}`;
    pendingClarify = null; clarifyQ = null;
    launchMission(goal); return;
  }
  activePage = activePage && !activePage.unsupported ? activePage : await captureActivePage();
  const page = { url: activePage.url, title: activePage.title, selection: activePage.selection, content: activePage.content, isPdf: activePage.isPdf };
  launchInstant(goal, page);
}

// ── Interactions ────────────────────────────────────────────────────────────
sendBtn.addEventListener("click", launch);
// Entrée = envoyer, Shift+Entrée = nouvelle ligne (même convention que la barre
// flottante et /quick — cohérence entre les surfaces).
goalEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); launch(); } });
goalEl.addEventListener("input", () => { goalEl.style.height = "auto"; goalEl.style.height = Math.min(120, goalEl.scrollHeight) + "px"; });

ctxHead.addEventListener("click", () => {
  const open = ctxHead.classList.toggle("open");
  tabsList.classList.toggle("open", open);
  connsBox.classList.toggle("open", open);
  if (open) loadConns();
});
$("conns-btn").addEventListener("click", () => { ctxHead.click(); });
$("tabs-all").addEventListener("click", () => { openTabs.forEach((t) => (t.checked = true)); renderContext(); });
$("tabs-none").addEventListener("click", () => { openTabs.forEach((t) => (t.checked = false)); renderContext(); });
alltabsEl.addEventListener("change", async () => { openTabs = await collectTabs(); renderContext(); });

// ── Boot ────────────────────────────────────────────────────────────────────
(async () => {
  const b = await send("prompta:baseUrl");
  if (b?.baseUrl) baseUrl = b.baseUrl;
  await Promise.all([loadModels(), loadHistory()]);
  activePage = await captureActivePage();
  openTabs = await collectTabs();
  renderContext();
  goalEl.focus();
})();
