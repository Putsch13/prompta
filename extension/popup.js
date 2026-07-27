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
let pendingClarify = null; // { goal, questions } en attente de précisions
let clarifyQ = null;       // questions à afficher
let pendingConnect = null; // { goal, missing:[slug…], expired } mission en attente de connexion
let connectTimer = null;   // poll des connexions (reprise auto)
let activePage = null;   // capture de l'onglet actif
let openTabs = [];       // [{title, url, checked}]
let session = [];        // échanges instantanés terminés (cette session popup)
let convoStart = 0;      // frontière « nouvelle conversation » (timestamp)

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
const slugLabel = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const connKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Réponse texte d'une mission simple : la clé "reponse" sinon le 1er output. */
function extractAnswer(output) {
  if (!output || typeof output !== "object") return null;
  if (typeof output.reponse === "string") return output.reponse;
  if (typeof output.result === "string") return output.result;
  const vals = Object.entries(output).filter(([k, v]) => !k.startsWith("__") && !k.endsWith("_output") && typeof v === "string");
  return vals.length ? vals[vals.length - 1][1] : null;
}
// lastError lu volontairement : sinon le navigateur logue « Unchecked
// runtime.lastError » quand le worker/event page est momentanément absent.
const send = (type, extra) => new Promise((res) => chrome.runtime.sendMessage({ type, ...extra }, (r) => { void chrome.runtime.lastError; res(r || { ok: false, status: 0, body: {} }); }));

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
  return { completed: "terminé", failed: "échec", awaiting_approval: "à valider", running: "en cours", pending: "en file", streaming: "répond…", needs_connect: "connexion requise" }[s] || s;
}
function msgCard(item, liveSteps) {
  const model = item.model ? ` · ${esc(item.model)}` : "";
  // Un run refusé AVANT création (connecteur manquant, clarification…) a un
  // runId placeholder « … » : aucun lien dossier ne doit pointer dessus.
  const hasRun = item.runId && item.runId !== "…";
  let body = item.notice ? `<div style="color:var(--green);font-size:12px;margin-bottom:6px">${esc(item.notice)}</div>` : "";
  if (item.status === "streaming" && !item.answer) body += `<div class="think"><span class="orb"></span> Prompta réfléchit…</div>`;
  // Connexion manquante : carte avec un bouton OAuth par app + reprise auto.
  if (item.status === "needs_connect") {
    const btns = (item.missing || []).map((s) => `<button class="mact" data-connect="${esc(s)}" style="border-color:var(--accent);color:var(--accent);padding:5px 12px;font-size:12px;font-weight:600">🔌 Connecter ${esc(slugLabel(s))}</button>`).join(" ");
    body += `<div style="margin-top:4px">
      <div style="font-weight:600;color:var(--ink);margin-bottom:3px">Connexion requise</div>
      <div style="color:var(--soft);font-size:12px;line-height:1.5">${esc(item.error || "Cette mission a besoin d'apps pas encore connectées.")}</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">${btns}</div>
      ${item.connectExpired
        ? `<button class="mact" data-resume="1" style="margin-top:8px">↻ Reprendre la mission</button>`
        : `<div style="margin-top:7px;font-size:11px;color:var(--faint)">⏳ Je surveille tes connexions — la mission repartira toute seule.</div>`}
    </div>`;
  }
  // Validation humaine : carte in-feed (contenu éditable, décision ici même).
  if (item.status === "awaiting_approval" && liveSteps) {
    if (item.approval) {
      const p = item.approval.payload || {};
      const isQ = p.kind === "question";
      body += `<div style="margin-top:8px;border:1px solid var(--accent);border-radius:11px;padding:9px;background:var(--panel)">
        <div style="font-weight:600;color:${isQ ? "var(--accent)" : "var(--ink)"};font-size:12px">${isQ ? "💬 Prompta a besoin d'une précision" : `✋ Validation requise${p.label ? ` — ${esc(p.label)}` : ""}`}</div>
        ${isQ ? `<div style="margin-top:5px;color:var(--ink);font-size:12px;line-height:1.5">${esc(p.preview || p.label || "")}</div>` : ""}
        <textarea data-aptext ${isQ ? 'placeholder="Ta réponse…"' : ""} style="width:100%;margin-top:7px;min-height:${isQ ? "52" : "80"}px;max-height:170px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;color:var(--ink);font-size:12px;padding:7px;resize:vertical;outline:none;line-height:1.45;box-sizing:border-box">${isQ ? "" : esc(p.full || p.preview || "")}</textarea>
        <div style="display:flex;gap:7px;margin-top:7px;justify-content:flex-end">
          <button class="mact" data-apreject="1" style="border-color:var(--red);color:var(--red);padding:5px 11px;font-size:12px">${isQ ? "Annuler la mission" : "Refuser"}</button>
          ${isQ ? "" : `<button class="mact" data-apskip="1" title="Ne pas faire cette action, mais continuer la mission" style="padding:5px 11px;font-size:12px">Passer</button>`}
          <button data-approve="1" style="background:var(--accent);color:#04121F;border:none;border-radius:8px;padding:5px 13px;font-size:12px;font-weight:600;cursor:pointer">${isQ ? "Répondre ↵" : "Valider"}</button>
        </div>
        ${item.approvalError ? `<div class="err" style="margin-top:5px;font-size:11px">${esc(item.approvalError)}</div>` : ""}
      </div>`;
    } else {
      body += `<div class="think" style="margin-top:6px"><span class="orb"></span> Je récupère la demande de validation…</div>`;
    }
  }
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
    footer += `<div class="warn" style="margin-top:6px;font-size:11px">⏸ <a href="${validateUrl}" target="_blank" rel="noopener">${liveSteps ? "ouvrir dans le dashboard ↗" : "valider dans Prompta"}</a></div>`;
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
  const dotCls = item.status === "needs_connect" ? "s-awaiting_approval" : `s-${esc(item.status)}`;
  return `<div class="msg" data-run="${esc(item.runId || "")}">
    <div class="goal">${esc(item.goal || item.title || "Mission")}</div>
    ${body}${footer}
    <div class="meta"><span class="dot ${dotCls}"></span>${statusLabel(item.status)}${model}${saveBtn}${savedNote}${cancelBtn}</div>
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
let lastFeedSig = "";
function renderFeed(force) {
  const seen = new Set(history.map((h) => (h.goal || "").slice(0, 200)));
  const localItems = session.filter((s) => !seen.has((s.goal || "").slice(0, 200)));
  const items = [...history, ...localItems].filter(inConvo);
  // Signature : ne reconstruire le DOM que si quelque chose a changé — sinon
  // chaque tick de poll effacerait ce que l'utilisateur tape dans la carte
  // de validation (textarea éditable).
  const sig = items.map((h) => (h.runId || h.goal) + h.status + (h.savedAgent || "")).join("|")
    + "#" + (current ? `${current.runId}:${current.status}:${current.stepsCompleted}:${(current.answer || "").length}:${(current.planned || []).length}:${current.approval ? current.approval.id : ""}:${current.approvalError || ""}:${current.connectExpired ? "x" : ""}:${(current.missing || []).join(",")}:${current.notice || ""}` : "")
    + "?" + (clarifyQ ? clarifyQ.join("|") : "");
  if (!force && sig === lastFeedSig) return;
  lastFeedSig = sig;
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
      renderFeed(true);
    } else { b.disabled = false; b.textContent = "💾 garder comme agent"; }
  }));
  // Connexion manquante : OAuth dans un nouvel onglet ; la reprise est gérée
  // par le poll des connexions (qui survit à la fermeture du popup via storage).
  feed.querySelectorAll("[data-connect]").forEach((b) => b.addEventListener("click", () => {
    const slug = b.dataset.connect;
    window.open(`${baseUrl}/api/connectors/${encodeURIComponent(slug)}/connect?returnUrl=${encodeURIComponent(`${baseUrl}/dashboard/connexions?connected=${slug}`)}`, "_blank");
  }));
  feed.querySelectorAll("[data-resume]").forEach((b) => b.addEventListener("click", () => {
    if (!pendingConnect) return;
    // Lire la page AVANT setPendingConnect(null) — sinon la page d'origine est
    // perdue et la mission repart sur la page courante (celle des connexions).
    const g = pendingConnect.goal;
    const origPage = pendingConnect.page || null;
    setPendingConnect(null);
    launching = true; sendBtn.disabled = true;
    launchMission(g, null, origPage);
  }));
  // Validation in-feed : décision ici même, puis reprise du suivi du run.
  const apText = feed.querySelector("[data-aptext]");
  const isQ = current && current.approval && (current.approval.payload || {}).kind === "question";
  if (apText && isQ) {
    const yesBtn = feed.querySelector("[data-approve]");
    const sync = () => { if (yesBtn) yesBtn.disabled = !apText.value.trim(); };
    sync();
    apText.addEventListener("input", sync);
  }
  feed.querySelectorAll("[data-approve],[data-apreject],[data-apskip]").forEach((b) => b.addEventListener("click", async () => {
    if (!current || !current.approval) return;
    if (b.hasAttribute("data-approve") && isQ && (!apText || !apText.value.trim())) return;
    // « Passer » : on saute CETTE écriture, la mission continue. Refuser la
    // tue entièrement — sur 10 envois, ça détruisait aussi les suivants.
    const decision = b.hasAttribute("data-approve")
      ? "approved"
      : b.hasAttribute("data-apskip") ? "skipped" : "rejected";
    feed.querySelectorAll("[data-approve],[data-apreject],[data-apskip]").forEach((x) => { x.disabled = true; });
    const r = await send("prompta:approve", {
      runId: current.runId,
      approvalId: current.approval.id,
      decision,
      modifiedContent: decision === "approved" && apText ? apText.value : undefined,
    });
    if (r?.ok) {
      current.decidedApprovalId = current.approval.id;
      current.approval = null; current.approvalError = null;
      current.status = "running"; // optimiste — le poll (toujours actif) corrige
      renderFeed(true);
    } else {
      current.approvalError = r?.body?.error || r?.body?.message || `Décision refusée (${r?.status || "réseau"}) — réessaie.`;
      renderFeed(true);
    }
  }));
  // Ne ré-ancrer en bas que si l'utilisateur y est déjà : sinon on le ramène
  // de force en bas à chaque tick de poll pendant qu'il remonte lire.
  if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90) feed.scrollTop = feed.scrollHeight;
}

// ── Connexion manquante : mémorisation + reprise automatique ────────────────
// Persistée dans chrome.storage.session : le popup FERME quand l'onglet OAuth
// s'ouvre — au retour, la mission en attente est restaurée et le poll repart.
function setPendingConnect(v) {
  pendingConnect = v;
  if (!v) { clearInterval(connectTimer); connectTimer = null; }
  try { chrome.storage.session.set({ popup_pending_connect: v ? { goal: v.goal, missing: v.missing, startedAt: v.startedAt, page: v.page || null } : null }).catch(() => { /* */ }); } catch { /* storage indispo */ }
}
const CONNECT_POLL_MS = 5000;
const CONNECT_MAX_MS = 10 * 60 * 1000;
function startConnectPoll() {
  clearInterval(connectTimer);
  connectTimer = setInterval(async () => {
    if (!pendingConnect) { clearInterval(connectTimer); connectTimer = null; return; }
    if (Date.now() - (pendingConnect.startedAt || 0) > CONNECT_MAX_MS) {
      // Timeout : mission gardée, reprise MANUELLE via le bouton « Reprendre ».
      clearInterval(connectTimer); connectTimer = null;
      pendingConnect.expired = true;
      if (current && current.status === "needs_connect") { current.connectExpired = true; renderFeed(true); }
      return;
    }
    const r = await send("prompta:connections");
    if (!r?.ok || !Array.isArray(r.body?.connections)) return;
    const usable = new Set(r.body.connections.filter((c) => c.usable).map((c) => connKey(c.connectorId)));
    const still = pendingConnect.missing.filter((s) => !usable.has(connKey(s)));
    if (still.length) return;
    const { goal: g, missing, page: origPage } = pendingConnect;
    setPendingConnect(null);
    launching = true; sendBtn.disabled = true;
    launchMission(g, `✓ ${missing.map(slugLabel).join(", ")} connecté — je reprends la mission`, origPage);
  }, CONNECT_POLL_MS);
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
    if (["completed", "failed", "cancelled"].includes(r.body.status)) {
      stopPolling(); launching = false; sendBtn.disabled = false;
      loadHistory(); // le run terminé (et sa réponse) rejoint le fil
    } else if (r.body.status === "awaiting_approval") {
      // La validation se fait ICI, dans le popup : carte in-feed éditable,
      // et on CONTINUE de poller le run jusqu'au terme.
      launching = false; sendBtn.disabled = false;
      ensureApproval();
    }
  }, 2500);
}

/** Charge la demande de validation du run courant (carte in-feed éditable). */
async function ensureApproval() {
  const c = current;
  if (!c || c.approval || c.approvalLoading) return;
  if (c.approvalId && c.decidedApprovalId === c.approvalId) return; // décision déjà envoyée
  c.approvalLoading = true;
  try {
    const r = await send("prompta:approvals");
    if (!r?.ok || !Array.isArray(r.body?.items)) return;
    const item = r.body.items.find((a) => (c.approvalId && a.id === c.approvalId) || a.runId === c.runId || a.run_id === c.runId);
    if (item && current === c && item.id !== c.decidedApprovalId) {
      c.approval = { id: item.id, payload: item.payload || {} };
      renderFeed(true);
    }
  } finally { c.approvalLoading = false; }
}

/** Bascule mission : capture des onglets cochés (session incluse) puis pipeline agent. */
async function launchMission(goal, notice, pageOverride) {
  current = { kind: "mission", runId: "…", goal, model: modelEl.value || null, status: "pending", stepsCompleted: 0, planned: [], notice: notice || null };
  renderFeed();
  // Reprise post-OAuth : page d'origine mémorisée, pas la page de connexions.
  let page = pageOverride;
  if (!page) {
    activePage = await captureActivePage();
    page = { ...activePage };
    if (!exploreEl.checked) page.links = undefined;
    const targeted = openTabs.filter((t) => t.checked).map((t) => ({ title: t.title, url: t.url }));
    if (targeted.length) {
      const cap = await send("prompta:tabcontents", { urls: targeted.map((t) => t.url), maxTabs: 8, maxChars: 8000 });
      page.openTabs = (cap?.ok && Array.isArray(cap.tabs) ? cap.tabs : targeted).filter((t) => t.url !== page.url);
    }
  }

  const r = await send("prompta:execute", { payload: { goal, page, modelId: modelEl.value || undefined, history: buildConvoHistory() } });
  if (r?.ok && Array.isArray(r.body?.clarify) && r.body.clarify.length) {
    launching = false; sendBtn.disabled = false;
    pendingClarify = { goal, questions: r.body.clarify }; clarifyQ = r.body.clarify; current = null;
    renderFeed(); goalEl.focus(); return;
  }
  if (!r?.ok) {
    launching = false; sendBtn.disabled = false;
    if (r?.status === 409 && r.body?.missingConnectors?.length) {
      // Mission MÉMORISÉE : carte « Connexion requise » + reprise automatique
      // dès que toutes les apps manquantes sont connectées (poll 5 s).
      current.status = "needs_connect";
      current.missing = r.body.missingConnectors;
      current.error = r.body.message || `Cette mission a besoin de : ${r.body.missingConnectors.join(", ")}.`;
      setPendingConnect({ goal, missing: [...r.body.missingConnectors], page, startedAt: Date.now() });
      startConnectPoll();
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
  // Ce que le plan ne fait pas alors que l'ordre le suggérait (récurrence) :
  // le serveur seul le sait, et se taire laisserait croire à une automatisation.
  if (r.body.notice) current.notice = r.body.notice;
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

/**
 * Historique conversationnel (échanges + résultats de missions, échecs compris)
 * — même logique que le panneau : les suites/corrections gardent le contexte.
 */
/** Un item appartient-il à la conversation courante ? (frontière ✚) */
function inConvo(it) {
  if (!convoStart) return true;
  const t = it.at ?? (it.createdAt ? Date.parse(it.createdAt) : 0);
  return t >= convoStart;
}

function buildConvoHistory() {
  const hist = [];
  for (const it of [...history, ...session].filter(inConvo).slice(-8)) {
    if (!it || !it.goal) continue;
    hist.push({ role: "user", content: String(it.goal).slice(0, 1500) });
    if (it.status === "completed" && it.answer) {
      hist.push({ role: "assistant", content: String(it.answer).slice(0, 1500) });
    } else if (it.runId || it.kind === "mission") {
      const t = (it.title || it.goal || "mission").slice(0, 90);
      const err = it.error ? ` — ${String(it.error).slice(0, 250)}` : "";
      hist.push({ role: "assistant", content: `[Mission « ${t} » — statut : ${it.status || "?"}${err}]` });
    }
  }
  return hist.slice(-8);
}

/** Tac au tac streamé ; bascule automatiquement en mission si le modèle le décide. */
function launchInstant(goal, page) {
  current = { kind: "instant", goal, model: modelEl.value || null, status: "streaming", answer: "" };
  renderFeed();
  const hist = buildConvoHistory();
  const port = chrome.runtime.connect({ name: "prompta:instant" });
  let closed = false;
  // Watchdog : aucun événement SSE pendant 90 s → coupure propre (fini le
  // « streaming » infini quand le serveur s'est tu sans fermer le flux).
  let watchdogT = null;
  const armWatchdog = () => {
    clearTimeout(watchdogT);
    watchdogT = setTimeout(() => {
      try { port.postMessage({ type: "abort" }); } catch { /* port fermé */ }
      finish(true, "La réponse a expiré — réessaie.");
    }, 90_000);
  };
  const finish = (fail, msg) => {
    if (closed) return; closed = true;
    clearTimeout(watchdogT);
    try { port.disconnect(); } catch { /* déjà fermé */ }
    launching = false; sendBtn.disabled = false;
    if (fail) { current.status = "failed"; current.error = msg || "Réponse interrompue."; }
    else if (current.answer) { current.status = "completed"; current.at = Date.now(); session.push(current); current = null; }
    else { current = null; }
    renderFeed(true);
  };
  port.onMessage.addListener((m) => {
    armWatchdog();
    if (m?.delta) { current.answer += m.delta; renderFeed(true); }
    else if (m?.mission) { closed = true; clearTimeout(watchdogT); try { port.disconnect(); } catch { /* */ } launchMission(goal); }
    else if (m?.done) finish(false);
    else if (m?.error) finish(true, m.error + (m.status === 401 ? " — connecte-toi à Prompta." : ""));
    else if (m?.closed && !closed) finish(current.answer ? false : true, "Connexion interrompue.");
  });
  port.onDisconnect.addListener(() => { if (!closed) finish(current?.answer ? false : true, "Connexion interrompue."); });
  armWatchdog();
  port.postMessage({ type: "start", payload: { goal, page, modelId: modelEl.value || undefined, history: hist.slice(-6) } });
}

async function launch() {
  if (launching) return;
  let goal = goalEl.value.trim();
  if (goal.length < 2) return;
  launching = true; sendBtn.disabled = true;
  goalEl.value = ""; goalEl.style.height = "auto";
  // Couper le poll de la mission précédente avant d'en lancer une autre.
  stopPolling();
  // Nouvelle demande explicite : la mission en attente de connexion est
  // abandonnée (sinon sa reprise auto écraserait le suivi de celle-ci).
  if (pendingConnect) setPendingConnect(null);
  if (pendingClarify) {
    goal = `${pendingClarify.goal}\n\nQuestions posées : ${(pendingClarify.questions || []).join(" | ")}\nRéponses de l'utilisateur : ${goal}`;
    pendingClarify = null; clarifyQ = null;
    launchMission(goal); return;
  }
  activePage = activePage && !activePage.unsupported ? activePage : await captureActivePage();
  const page = { url: activePage.url, title: activePage.title, selection: activePage.selection, content: activePage.content, isPdf: activePage.isPdf };
  launchInstant(goal, page);
}

// ── Interactions ────────────────────────────────────────────────────────────
// Bandeau « mise à jour » (ZIP hors store = pas d'auto-update)
send("prompta:update").then((r) => {
  if (!r?.ok || !r.update) return;
  const bar = document.createElement("div");
  bar.style.cssText = "padding:7px 12px;background:rgba(251,191,36,.09);border-bottom:1px solid rgba(251,191,36,.25);color:var(--amber);font-size:11.5px;line-height:1.45";
  bar.innerHTML = `⬆︎ Nouvelle version ${esc(r.update.latest)} disponible — <a href="#" id="upd-link" style="color:var(--amber);font-weight:600;text-decoration:underline">mettre à jour</a>`;
  feed.parentNode.insertBefore(bar, feed);
  bar.querySelector("#upd-link").addEventListener("click", async (e) => {
    e.preventDefault();
    const b = await send("prompta:baseUrl");
    chrome.tabs.create({ url: (b?.baseUrl || baseUrl) + "/prompta-partout" });
  });
});

sendBtn.addEventListener("click", launch);
// ✚ Nouvelle conversation : le fil repart à zéro, l'historique d'avant n'est
// plus envoyé au cerveau (fini les fausses « suites de mission »).
$("newconvo-btn").addEventListener("click", () => {
  convoStart = Date.now();
  pendingClarify = null; clarifyQ = null;
  setPendingConnect(null);
  clearInterval(pollTimer); pollTimer = null;
  if (current && current.runId && current.runId !== "…" && !["completed", "failed", "cancelled"].includes(current.status)) {
    send("prompta:cancel", { runId: current.runId });
    send("prompta:pilot-stop", { runId: current.runId });
  }
  current = null; launching = false; sendBtn.disabled = false;
  renderFeed(true); goalEl.focus();
});
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
  // Mission en attente de connexion (le popup a fermé pendant l'OAuth) :
  // on restaure la carte « Connexion requise » et le poll de reprise.
  try {
    const { popup_pending_connect } = await chrome.storage.session.get("popup_pending_connect");
    if (popup_pending_connect?.goal && Array.isArray(popup_pending_connect.missing) && popup_pending_connect.missing.length) {
      pendingConnect = { ...popup_pending_connect };
      current = {
        kind: "mission", runId: "…", goal: pendingConnect.goal, model: modelEl.value || null,
        status: "needs_connect", stepsCompleted: 0, planned: [],
        missing: pendingConnect.missing,
        error: `Cette mission a besoin de : ${pendingConnect.missing.join(", ")}.`,
        connectExpired: Date.now() - (pendingConnect.startedAt || 0) > CONNECT_MAX_MS,
      };
      if (current.connectExpired) pendingConnect.expired = true;
      else startConnectPoll();
      renderFeed(true);
    }
  } catch { /* storage.session indispo */ }
  activePage = await captureActivePage();
  openTabs = await collectTabs();
  renderContext();
  goalEl.focus();
})();
