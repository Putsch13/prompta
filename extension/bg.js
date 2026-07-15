/**
 * Prompta Everywhere — service worker.
 *
 * Toutes les requêtes réseau partent d'ici : avec host_permissions sur le
 * domaine Prompta, les cookies de session de l'utilisateur sont joints et les
 * restrictions CORS/SameSite ne s'appliquent pas. Le content script ne parle
 * qu'au service worker (messages), jamais au réseau directement.
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "prompta:execute") {
        sendResponse(await api("/api/extension/execute", { method: "POST", body: JSON.stringify(msg.payload) }));
      } else if (msg?.type === "prompta:status") {
        sendResponse(await api(`/api/run/agent/${encodeURIComponent(msg.runId)}`));
      } else if (msg?.type === "prompta:connections") {
        sendResponse(await api("/api/extension/connections"));
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
  chrome.contextMenus.create({
    id: "prompta-selection",
    title: "Prompta : agir sur la sélection",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "prompta-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "prompta:toggle", withSelection: true }).catch(() => {});
  }
});
