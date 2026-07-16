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
      } else {
        sendResponse({ ok: false, status: 0, body: { message: "message inconnu" } });
      }
    } catch (err) {
      sendResponse({ ok: false, status: 0, body: { message: String((err && err.message) || err) } });
    }
  })();
  return true; // réponse asynchrone
});

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

function toggleBarInTab(tabId) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "prompta:toggle" }).catch(() => {
    /* page sans content script (chrome://, Web Store…) : rien à faire */
  });
}

// Le clic sur l'icône ouvre le popup (default_popup) : onClicked NE PAS gérer.
// Entrées secondaires vers la barre in-page : raccourci Alt+P et menu contextuel.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-bar") toggleBarInTab(tab?.id);
});

chrome.runtime.onInstalled.addListener(() => {
  // removeAll d'abord : sur une mise à jour de l'extension, l'id existe déjà
  // et create échouerait (menu contextuel cassé).
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "prompta-selection",
      title: "Prompta : agir sur la sélection",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "prompta-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "prompta:toggle", withSelection: true }).catch(() => {});
  }
});
