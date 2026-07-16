/**
 * Prompta — assistant du quotidien (popup barre d'outils).
 *
 * Interface façon Cursor : choix du modèle (GPT/Claude/Gemini/Mistral),
 * panneau « ce que je vois » (page active + onglets ciblables), fil de
 * conversation (historique des missions), exécution live. Capture l'onglet
 * actif via chrome.scripting, la liste des onglets via chrome.tabs.
 */

let baseUrl = "https://prompta-sjtf.onrender.com";
let pollTimer = null;
let launching = false;
let pendingClarify = null; // { goal } en attente de précisions
let clarifyQ = null;       // questions à afficher
let activePage = null;   // capture de l'onglet actif
let openTabs = [];       // [{title, url, checked}]

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
  return { completed: "terminé", failed: "échec", awaiting_approval: "à valider", running: "en cours", pending: "en file" }[s] || s;
}
function msgCard(item, liveSteps) {
  const model = item.model ? ` · ${esc(item.model)}` : "";
  // Un run refusé AVANT création (connecteur manquant, clarification…) a un
  // runId placeholder « … » : aucun lien dossier ne doit pointer dessus.
  const hasRun = item.runId && item.runId !== "…";
  let body = "";
  if (liveSteps) {
    body = `<div class="steps">${liveSteps.map((label, i) => {
      const done = item.stepsCompleted ?? 0;
      const ic = i < done ? "✓" : i === done && (item.status === "running" || item.status === "pending") ? "▶" : "·";
      return `<div class="step"><span class="ic ${i < done ? "ok" : ""}">${ic}</span><span>${esc(label)}</span></div>`;
    }).join("")}</div>`;
  }
  let footer = "";
  if (item.answer) footer += `<div class="answer" style="margin-top:8px;color:var(--ink);white-space:pre-wrap">${esc(item.answer).slice(0, 4000)}</div>`;
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
    ? `<button data-cancel="${esc(item.runId)}" style="margin-left:auto;background:none;border:1px solid var(--line);color:var(--soft);border-radius:6px;font-size:10px;padding:1px 7px;cursor:pointer">■ stop</button>`
    : "";
  return `<div class="msg" data-run="${esc(item.runId)}">
    <div class="goal">${esc(item.goal || item.title || "Mission")}</div>
    ${body}${footer}
    <div class="meta"><span class="dot s-${esc(item.status)}"></span>${statusLabel(item.status)}${model}${cancelBtn}</div>
  </div>`;
}
let history = [];
let current = null; // { runId, goal, model, status, stepsCompleted, error, planned }
const SUGGESTIONS = [
  "Résume cette page en 5 points",
  "Compare mes onglets ouverts",
  "Rédige un email pro à partir de ma sélection",
];
function emptyState() {
  return `<div class="empty">Ton assistant du quotidien.<br>Pose une question rapide<br>ou confie-lui une grosse mission.<br><br>${SUGGESTIONS.map((s) => `<button data-suggest="${esc(s)}" style="display:block;margin:6px auto 0;background:var(--panel);border:1px solid var(--line);color:var(--soft);border-radius:999px;font-size:11px;padding:5px 12px;cursor:pointer">${esc(s)}</button>`).join("")}</div>`;
}
function renderFeed() {
  const items = [...history];
  const list = items.map((it) => msgCard(it)).join("");
  const cur = current ? msgCard(current, current.planned) : "";
  const clar = clarifyQ && clarifyQ.length
    ? `<div class="msg"><div class="goal" style="font-weight:600">Quelques précisions pour bien faire :</div><ul style="margin:6px 0 0;padding-left:18px;color:var(--soft)">${clarifyQ.map((q) => `<li>${esc(q)}</li>`).join("")}</ul><div style="color:var(--faint);font-size:11px;margin-top:6px">Réponds ci-dessous, je m'occupe du reste.</div></div>`
    : "";
  feed.innerHTML = (list + cur + clar) || emptyState();
  feed.querySelectorAll("[data-suggest]").forEach((b) => b.addEventListener("click", () => { goalEl.value = b.dataset.suggest; goalEl.focus(); }));
  feed.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    await send("prompta:cancel", { runId: b.dataset.cancel });
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
    renderFeed();
    // awaiting_approval est TERMINAL pour le poll : la validation se fait dans
    // le dashboard — sinon le composer reste bloqué indéfiniment.
    if (["completed", "failed", "cancelled", "awaiting_approval"].includes(r.body.status)) {
      stopPolling(); launching = false; sendBtn.disabled = false;
      loadHistory(); // le run terminé (et sa réponse) rejoint le fil
    }
  }, 2500);
}

async function launch() {
  if (launching) return;
  let goal = goalEl.value.trim();
  if (goal.length < 3) return;
  if (pendingClarify) { goal = `${pendingClarify.goal}\n\nPrécisions de l'utilisateur : ${goal}`; pendingClarify = null; clarifyQ = null; }
  launching = true; sendBtn.disabled = true;

  activePage = await captureActivePage();
  const page = { ...activePage };
  const targeted = openTabs.filter((t) => t.checked).map((t) => ({ title: t.title, url: t.url }));
  if (targeted.length) page.openTabs = targeted;
  if (!exploreEl.checked) page.links = undefined;

  current = { runId: "…", goal, model: modelEl.value || null, status: "pending", stepsCompleted: 0, planned: [] };
  renderFeed();
  goalEl.value = ""; goalEl.style.height = "auto";

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
  renderFeed();
  pollRun();
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
