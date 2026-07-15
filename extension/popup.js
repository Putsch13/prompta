/**
 * Prompta Everywhere — popup de la barre d'outils (pattern Joko).
 *
 * Un clic sur l'icône Prompta ouvre ce popup. Il capture le contexte de
 * l'onglet actif via chrome.scripting (fonction injectée dans la page), puis
 * lance un agent instantané et affiche les étapes en direct — sans dépendre
 * du content script (fonctionne même si la page ne l'a pas chargé).
 */

let baseUrl = "https://prompta-sjtf.onrender.com";
let pollTimer = null;
let capturedPage = null;
let launching = false;

const $ = (id) => document.getElementById(id);
const goalEl = $("goal");
const sendBtn = $("send");
const statusBox = $("status");
const chipsBox = $("chips");
const connsBox = $("conns");
const exploreEl = $("explore");
const allTabsEl = $("alltabs");

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function send(type, extra) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...extra }, (r) => resolve(r || { ok: false, status: 0, body: {} }));
  });
}

/** Fonction INJECTÉE dans la page active (contexte page, pas popup). */
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
    const seen = new Set();
    links = [];
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
  return {
    url: location.href,
    title: document.title || "",
    selection: String(window.getSelection() || "").trim().slice(0, 4000) || undefined,
    content,
    links,
    isPdf,
  };
}

/** Liste tous les onglets ouverts (titre + URL) — la « vue d'ensemble ». */
async function collectOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const seen = new Set();
    const out = [];
    for (const t of tabs) {
      const u = t.url || "";
      if (!/^https?:/.test(u)) continue; // ignore chrome://, extensions, etc.
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({ title: t.title || "", url: u });
      if (out.length >= 30) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function capturePage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const base = { url: tab?.url || "", title: tab?.title || "" };
  const openTabs = allTabsEl.checked ? await collectOpenTabs() : undefined;
  if (!tab?.id || !/^https?:|^file:/.test(tab.url || "")) {
    return { ...base, openTabs, unsupported: true };
  }
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageCaptureFn,
      args: [exploreEl.checked, 15000, 40],
    });
    return { ...(inj?.result ?? { ...base, unsupported: true }), openTabs };
  } catch {
    // chrome://, Web Store, PDF sans accès fichier, page restreinte
    return { ...base, openTabs, unsupported: true };
  }
}

function refreshChips() {
  if (!capturedPage) {
    chipsBox.innerHTML = `<span class="chip">capture de la page…</span>`;
    return;
  }
  const p = capturedPage;
  chipsBox.innerHTML =
    `<span class="chip">📄 ${esc((p.title || p.url || "page").slice(0, 42))}</span>` +
    (p.isPdf ? `<span class="chip">PDF</span>` : "") +
    (p.selection ? `<span class="chip">✂️ sélection (${p.selection.length} car.)</span>` : "") +
    (p.openTabs?.length ? `<span class="chip">👁️ ${p.openTabs.length} onglets vus</span>` : "") +
    (p.unsupported
      ? `<span class="chip" style="color:#fbbf24">page active non lisible — j'utilise ${p.openTabs?.length ? "tes onglets + " : ""}ton ordre</span>`
      : "");
}

function renderRun(run, planned) {
  const done = run.steps_completed ?? 0;
  const steps = (planned || []).map((label, i) => {
    const ic = i < done ? "✓" : i === done && (run.status === "running" || run.status === "pending") ? "▶" : "·";
    return `<div class="step"><span class="ic ${i < done ? "ok" : ""}">${ic}</span><span>${esc(label)}</span></div>`;
  }).join("");
  let footer = "";
  if (run.status === "awaiting_approval") {
    footer = `<div class="warn">⏸ Validation requise — <a href="${baseUrl}/dashboard/validations" target="_blank" rel="noopener">valider dans Prompta</a></div>`;
  } else if (run.status === "completed") {
    footer = `<div class="ok">✅ Terminé — <a href="${baseUrl}/dashboard/runs/${esc(run.id)}" target="_blank" rel="noopener">voir le dossier de mission</a></div>`;
  } else if (run.status === "failed") {
    footer = `<div class="err">✗ ${esc(run.error_message || "Échec")}</div><a href="${baseUrl}/dashboard/runs/${esc(run.id)}" target="_blank" rel="noopener">détails</a>`;
  }
  statusBox.innerHTML = steps + footer;
}

function stopPolling(restore) {
  clearInterval(pollTimer);
  pollTimer = null;
  if (restore) { launching = false; sendBtn.disabled = false; sendBtn.textContent = "Lancer l'agent"; }
}

function pollRun(runId, planned) {
  stopPolling(false);
  let errorStreak = 0;
  pollTimer = setInterval(async () => {
    const r = await send("prompta:status", { runId });
    if (!r?.ok || !r.body) {
      if (++errorStreak >= 5) {
        stopPolling(true);
        statusBox.innerHTML = `<div class="err">Suivi interrompu (${r?.status === 401 ? "session expirée" : "serveur injoignable"}). Le run continue : <a href="${baseUrl}/dashboard/runs/${esc(runId)}" target="_blank" rel="noopener">l'ouvrir</a>.</div>`;
      }
      return;
    }
    errorStreak = 0;
    renderRun(r.body, r.body.planned_steps?.length ? r.body.planned_steps : planned);
    if (["completed", "failed", "cancelled"].includes(r.body.status)) stopPolling(true);
  }, 2500);
}

async function launch() {
  // Anti ré-entrance : le raccourci Cmd/Ctrl+Entrée appelle launch() directement
  // et court-circuiterait le bouton désactivé → double run facturé + suivi orphelin.
  if (launching) return;
  const goal = goalEl.value.trim();
  if (goal.length < 5) { statusBox.innerHTML = `<div class="warn">Décris la mission (5 caractères minimum).</div>`; return; }
  launching = true;
  sendBtn.disabled = true;
  sendBtn.textContent = "Création de l'agent…";
  statusBox.innerHTML = `<div>🧠 Prompta conçoit l'agent…</div>`;

  // Re-capture au moment du lancement (sélection/contenu à jour).
  const page = await capturePage();
  capturedPage = page;
  const r = await send("prompta:execute", { payload: { goal, page } });
  if (!r?.ok) {
    launching = false;
    stopPolling(true);
    if (r?.status === 409 && r.body?.missingConnectors?.length) {
      statusBox.innerHTML = `<div class="warn">⚠️ À connecter d'abord : ${esc(r.body.missingConnectors.join(", "))} — <a href="${baseUrl}/dashboard/connexions" target="_blank" rel="noopener">ouvrir Connexions</a>, puis relance.</div>`;
      return;
    }
    const msg = r?.body?.message || (r?.status === 401 ? "Connecte-toi à Prompta dans un onglet, puis réessaie." : `Erreur (${r?.status || "réseau"})`);
    statusBox.innerHTML = `<div class="err">${esc(msg)}</div>`;
    return;
  }
  statusBox.innerHTML = `<div class="ok">🚀 « ${esc(r.body.title)} » — ${r.body.stepsPlanned} étapes</div><div>Exécution en cours…</div>`;
  sendBtn.textContent = "Agent en cours…";
  pollRun(r.body.runId, null);
}

sendBtn.addEventListener("click", launch);
goalEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) launch();
});
// Recompte les onglets vus quand on (dé)coche « voir tout ce que j'ai ouvert ».
allTabsEl.addEventListener("change", async () => {
  capturedPage = await capturePage();
  refreshChips();
});

$("conns-toggle").addEventListener("click", async () => {
  const open = connsBox.classList.toggle("open");
  if (!open) return;
  connsBox.innerHTML = `<span style="color:#9ca3af">chargement…</span>`;
  const r = await send("prompta:connections");
  if (!r?.ok) {
    connsBox.innerHTML = `<span class="warn">${r?.status === 401 ? "Connecte-toi à Prompta dans un onglet." : "Connexions inaccessibles."}</span>`;
    return;
  }
  const seen = new Set();
  connsBox.innerHTML = (r.body.connections || [])
    .filter((c) => { const k = c.connectorId.toLowerCase().replace(/[^a-z0-9]/g, ""); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((c) => `<span class="conn"><span class="led ${c.usable ? "on" : "off"}"></span>${esc(c.connectorId)}</span>`)
    .join("") || `<span class="warn">Aucune app connectée.</span>`;
});

// Boot : base URL + capture immédiate pour afficher le contexte.
(async () => {
  const b = await send("prompta:baseUrl");
  if (b?.baseUrl) baseUrl = b.baseUrl;
  capturedPage = await capturePage();
  refreshChips();
  goalEl.focus();
})();
