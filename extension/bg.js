/**
 * Prompta partout — service worker.
 *
 * Toutes les requêtes réseau partent d'ici : avec host_permissions sur le
 * domaine Prompta, les cookies de session de l'utilisateur sont joints et les
 * restrictions CORS/SameSite ne s'appliquent pas. Le content script ne parle
 * qu'au service worker (messages), jamais au réseau directement.
 *
 * Deux canaux :
 *  - messages one-shot (sendMessage) pour les appels requête/réponse ;
 *  - port « prompta:instant » (connect) pour le TAC AU TAC streamé : le
 *    service worker lit le flux SSE et relaie chaque delta au fil de l'eau.
 */

const DEFAULT_BASE_URL = "https://prompta-sjtf.onrender.com";

async function baseUrl() {
  const { promptaBaseUrl } = await chrome.storage.sync.get("promptaBaseUrl");
  return (promptaBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
}

async function api(path, options = {}) {
  const base = await baseUrl();
  const res = await fetch(base + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* réponse non-JSON (proxy, HTML d'erreur) */
  }
  return { ok: res.ok, status: res.status, body };
}

// ── Capture des onglets (avec la session de l'utilisateur) ───────────────────
// Le content script tourne sur toutes les pages http(s) : on lui demande de se
// capturer lui-même. C'est la SEULE façon de lire un onglet derrière login.
async function listOpenTabs() {
  const tabs = await chrome.tabs.query({});
  const seen = new Set();
  const out = [];
  for (const t of tabs) {
    const u = t.url || "";
    if (!/^https?:/.test(u) || seen.has(u)) continue;
    seen.add(u);
    out.push({ id: t.id, title: t.title || "", url: u });
    if (out.length >= 30) break;
  }
  return out;
}

async function captureTabContents(urls, maxTabs = 8, maxChars = 8000) {
  const wanted = new Set(urls || []);
  const tabs = await listOpenTabs();
  const targets = tabs.filter((t) => wanted.has(t.url)).slice(0, maxTabs);
  const results = await Promise.all(
    targets.map(async (t) => {
      try {
        const r = await chrome.tabs.sendMessage(t.id, { type: "prompta:capture", maxChars });
        if (r && typeof r.content === "string" && r.content.trim()) {
          return { title: t.title, url: t.url, content: r.content.slice(0, maxChars) };
        }
      } catch {
        /* onglet sans content script (PDF viewer, page en erreur…) */
      }
      return { title: t.title, url: t.url };
    }),
  );
  return results;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "prompta:execute") {
        sendResponse(await api("/api/extension/execute", { method: "POST", body: JSON.stringify(msg.payload) }));
      } else if (msg?.type === "prompta:status") {
        sendResponse(await api(`/api/run/agent/${encodeURIComponent(msg.runId)}`));
      } else if (msg?.type === "prompta:cancel") {
        sendResponse(await api(`/api/run/agent/${encodeURIComponent(msg.runId)}/cancel`, { method: "POST" }));
      } else if (msg?.type === "prompta:save-agent") {
        sendResponse(await api("/api/extension/save-agent", { method: "POST", body: JSON.stringify({ runId: msg.runId }) }));
      } else if (msg?.type === "prompta:connections") {
        sendResponse(await api("/api/extension/connections"));
      } else if (msg?.type === "prompta:approvals") {
        sendResponse(await api("/api/approvals"));
      } else if (msg?.type === "prompta:approve") {
        sendResponse(await api(`/api/run/agent/${encodeURIComponent(msg.runId)}/approve`, {
          method: "POST",
          body: JSON.stringify({
            approvalId: msg.approvalId,
            decision: msg.decision,
            modifiedContent: msg.modifiedContent || undefined,
          }),
        }));
      } else if (msg?.type === "prompta:models") {
        sendResponse(await api("/api/extension/models"));
      } else if (msg?.type === "prompta:history") {
        sendResponse(await api("/api/extension/history"));
      } else if (msg?.type === "prompta:tabs") {
        const tabs = await listOpenTabs();
        sendResponse({ ok: true, tabs: tabs.map((t) => ({ title: t.title, url: t.url })) });
      } else if (msg?.type === "prompta:tabcontents") {
        sendResponse({ ok: true, tabs: await captureTabContents(msg.urls, msg.maxTabs, msg.maxChars) });
      } else if (msg?.type === "prompta:baseUrl") {
        sendResponse({ ok: true, baseUrl: await baseUrl() });
      } else if (msg?.type === "prompta:pilot-watch") {
        // Un run vient d'être lancé depuis cet onglet (ou l'onglet actif pour le
        // popup) : le service worker surveille ses tâches de pilotage navigateur.
        const tabId = msg.tabId ?? _sender?.tab?.id;
        if (msg.runId && tabId) watchPilotRun(msg.runId, tabId);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, status: 0, body: { message: "message inconnu" } });
      }
    } catch (err) {
      sendResponse({ ok: false, status: 0, body: { message: String((err && err.message) || err) } });
    }
  })();
  return true; // réponse asynchrone
});

// ── Pilotage du navigateur (copilote visible) ────────────────────────────────
// Une étape « browser » d'un run pousse des tâches (snapshot / action) dans une
// file serveur. Le worker les récupère en pollant le statut du run, les fait
// exécuter par le content script de l'onglet piloté (overlay + confirmation
// in-page pour les actions risquées), puis poste la réponse.
const pilotSessions = new Map(); // runId → { tabId, timer, busy, seen:Set }
const PILOT_POLL_MS = 1500;
const PILOT_MAX_MS = 15 * 60 * 1000;

// Le service worker MV3 est recyclé par Chrome sans préavis : la Map en
// mémoire meurt avec lui. On persiste donc les runs pilotés dans
// chrome.storage.session ({ runId → tabId }) pour ré-armer au réveil.
function persistPilotIds() {
  const ids = {};
  for (const [runId, s] of pilotSessions) ids[runId] = s.tabId;
  try { chrome.storage.session.set({ pilot_watch_ids: ids }).catch(() => { /* */ }); } catch { /* storage indispo */ }
}

async function restorePilotSessions() {
  try {
    const { pilot_watch_ids } = await chrome.storage.session.get("pilot_watch_ids");
    for (const [runId, tabId] of Object.entries(pilot_watch_ids || {})) {
      if (runId && typeof tabId === "number" && !pilotSessions.has(runId)) watchPilotRun(runId, tabId);
    }
  } catch { /* storage.session indispo */ }
}

function watchPilotRun(runId, tabId) {
  const existing = pilotSessions.get(runId);
  if (existing) { existing.tabId = tabId; persistPilotIds(); return; }
  const s = { tabId, busy: false, seen: new Set(), timer: null, startedAt: Date.now() };
  pilotSessions.set(runId, s);
  persistPilotIds();
  s.timer = setInterval(() => {
    if (Date.now() - s.startedAt > PILOT_MAX_MS) { stopPilot(runId); return; }
    pilotTick(runId).catch(() => { /* tick suivant */ });
  }, PILOT_POLL_MS);
}

function stopPilot(runId) {
  const s = pilotSessions.get(runId);
  if (!s) return;
  clearInterval(s.timer);
  pilotSessions.delete(runId);
  persistPilotIds();
  chrome.tabs.sendMessage(s.tabId, { type: "prompta:pilot-end" }).catch(() => { /* onglet fermé */ });
}

// Ré-armement au démarrage du worker (top-level : s'exécute à CHAQUE réveil).
restorePilotSessions();

// Alarme périodique : garde le worker vivant tant qu'un pilotage est actif et
// re-tick les sessions (les setInterval ne survivent pas au recyclage).
chrome.alarms.create("pilot-keepalive", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "pilot-keepalive") return;
  (async () => {
    await restorePilotSessions();
    for (const runId of pilotSessions.keys()) {
      pilotTick(runId).catch(() => { /* tick suivant */ });
    }
  })();
});

async function pilotTick(runId) {
  const s = pilotSessions.get(runId);
  if (!s || s.busy) return;
  s.busy = true;
  try {
    const r = await api(`/api/run/agent/${encodeURIComponent(runId)}`);
    if (!r.ok || !r.body) return;
    if (["completed", "failed", "cancelled", "awaiting_approval"].includes(r.body.status)) {
      stopPilot(runId);
      return;
    }
    const task = r.body.browser_task;
    if (!task || s.seen.has(task.id)) return;
    s.seen.add(task.id);
    let response;
    try {
      response = await runPilotTask(s, task.request || {});
    } catch (err) {
      response = { ok: false, error: String((err && err.message) || err).slice(0, 300) };
    }
    await api(`/api/extension/browser-tasks/${encodeURIComponent(task.id)}`, {
      method: "POST",
      body: JSON.stringify(response),
    });
  } finally {
    s.busy = false;
  }
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id, info) => {
      // 600 ms de grâce après « complete » : laisser les apps SPA se peindre.
      if (id === tabId && info.status === "complete") setTimeout(finish, 600);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    setTimeout(finish, timeoutMs);
  });
}

async function tabSnapshot(tabId) {
  const r = await chrome.tabs.sendMessage(tabId, { type: "prompta:pilot-snapshot" });
  if (!r || !r.ok || !r.snapshot) throw new Error((r && r.error) || "Snapshot de page impossible (onglet fermé ?)");
  return r.snapshot;
}

/**
 * Résout l'onglet cible d'une tâche de pilotage. Sans tabHint : l'onglet de la
 * mission. Avec tabHint (extrait d'URL/titre) : retrouve l'onglet OUVERT
 * correspondant, le met au premier plan (l'utilisateur voit le pilotage) et
 * s'assure que le content script y est injecté.
 */
async function resolvePilotTab(s, request) {
  const hint = (request.tabHint || "").trim().toLowerCase();
  if (!hint) return s.tabId;
  if (s.hintKey === hint && s.hintTabId != null) return s.hintTabId;
  const tabs = await chrome.tabs.query({});
  const scored = tabs
    .filter((t) => t.id != null && /^https?:/i.test(t.url || ""))
    .map((t) => {
      const url = (t.url || "").toLowerCase();
      const title = (t.title || "").toLowerCase();
      let score = 0;
      if (url.includes(hint)) score += 3;
      if (title.includes(hint)) score += 2;
      // correspondance par mots (« pages jaunes » ↔ pagesjaunes.fr)
      const words = hint.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      for (const w of words) { if (url.includes(w)) score += 1; if (title.includes(w)) score += 1; }
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) {
    throw new Error(`Onglet « ${request.tabHint} » introuvable parmi les onglets ouverts — ouvre-le puis relance la mission.`);
  }
  const tab = scored[0].t;
  // Premier plan : le pilotage se fait sous les yeux de l'utilisateur.
  try { await chrome.tabs.update(tab.id, { active: true }); } catch { /* fenêtre fermée entre-temps */ }
  try { if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }); } catch { /* multi-fenêtres */ }
  // Content script absent (onglet ouvert avant l'install) → injection à la volée.
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "prompta:ping" });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await new Promise((r) => setTimeout(r, 400));
    } catch { /* page protégée (chrome://…) : le snapshot échouera avec un message clair */ }
  }
  s.hintKey = hint;
  s.hintTabId = tab.id;
  return tab.id;
}

async function runPilotTask(s, request) {
  const tabId = await resolvePilotTab(s, request);
  if (request.kind === "snapshot") {
    return { ok: true, snapshot: await tabSnapshot(tabId) };
  }
  const action = request.action || {};
  if (action.type === "navigate") {
    if (!/^https?:\/\//i.test(action.url || "")) return { ok: false, error: "URL de navigation invalide" };
    chrome.tabs.sendMessage(tabId, { type: "prompta:pilot-toast", label: request.label || "" }).catch(() => {});
    await chrome.tabs.update(tabId, { url: action.url });
    await new Promise((r) => setTimeout(r, 800));
    await waitForTabComplete(tabId);
    return { ok: true, snapshot: await tabSnapshot(tabId) };
  }
  if (action.type === "wait") {
    await new Promise((r) => setTimeout(r, 1500));
    return { ok: true, snapshot: await tabSnapshot(tabId) };
  }
  // click / type / select / scroll : exécutés PAR le content script.
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: "prompta:pilot-act", action, label: request.label || "" });
    if (!r) throw new Error("action sans réponse");
    return r;
  } catch {
    // Le clic a probablement déclenché une navigation (contexte du content
    // script détruit avant la réponse) : attendre le chargement, snapshot frais.
    await waitForTabComplete(tabId);
    return { ok: true, snapshot: await tabSnapshot(tabId) };
  }
}

// ── Tac au tac streamé ───────────────────────────────────────────────────────
// Port longue durée : le panneau envoie { payload }, le worker relaie chaque
// événement SSE ({delta} | {mission} | {done} | {error}) puis {closed}.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "prompta:instant") return;
  let aborter = null;
  port.onMessage.addListener(async (msg) => {
    if (msg?.type === "abort") {
      if (aborter) aborter.abort();
      return;
    }
    if (msg?.type !== "start") return;
    aborter = new AbortController();
    try {
      const base = await baseUrl();
      const res = await fetch(base + "/api/extension/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.payload),
        signal: aborter.signal,
      });
      if (!res.ok) {
        let body = null;
        try { body = await res.json(); } catch { /* non-JSON */ }
        port.postMessage({ error: (body && body.message) || `Erreur ${res.status}`, status: res.status });
        port.postMessage({ closed: true });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          try {
            port.postMessage(JSON.parse(t.slice(5).trim()));
          } catch {
            /* fragment invalide */
          }
        }
      }
      port.postMessage({ closed: true });
    } catch (err) {
      const aborted = err && err.name === "AbortError";
      if (!aborted) port.postMessage({ error: String((err && err.message) || err) });
      try { port.postMessage({ closed: true }); } catch { /* port déjà fermé */ }
    }
  });
  port.onDisconnect.addListener(() => {
    if (aborter) aborter.abort();
  });
});

async function toggleBarInTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "prompta:toggle" });
  } catch {
    // Content script absent (page fraîche, PDF viewer…) : injecter puis rouvrir.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tabId, { type: "prompta:toggle" });
    } catch {
      /* chrome://, Web Store, page système : pas d'injection possible */
    }
  }
}

// Clic sur l'icône P (barre d'outils) = panneau latéral à droite, comme Joko.
// Pas de default_popup : sinon onClicked ne se déclenche jamais.
chrome.action.onClicked.addListener((tab) => {
  toggleBarInTab(tab?.id);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-bar") toggleBarInTab(tab?.id);
});

function ensureContextMenu() {
  // removeAll d'abord : sur une mise à jour de l'extension (ou une recréation
  // au démarrage), l'id existe déjà et create échouerait (menu cassé).
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "prompta-selection",
      title: "Prompta : agir sur la sélection",
      contexts: ["selection"],
    });
  });
}
// Chrome persiste les menus (onInstalled suffit) ; Firefox (event page MV3) ne
// les persiste PAS entre deux démarrages du navigateur et onInstalled ne se
// re-déclenche pas au restart → on recrée aussi sur onStartup (no-op ailleurs).
chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "prompta-selection" && tab?.id) {
    toggleBarInTab(tab.id);
  }
});
