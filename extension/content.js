/**
 * Prompta Everywhere — content script.
 *
 * Un bouton flottant + une barre de commande (Shadow DOM, zéro fuite CSS).
 * À l'envoi : capture du contexte de page (titre, sélection, contenu lisible,
 * liens pour l'exploration du site) → service worker → run Prompta → suivi
 * live des étapes dans le panneau.
 */

(() => {
  if (window.__promptaEverywhere) return;
  window.__promptaEverywhere = true;

  const MAX_CONTENT = 15000;
  const MAX_LINKS = 40;
  let panelOpen = false;
  let pollTimer = null;
  let baseUrl = "https://prompta-sjtf.onrender.com";
  chrome.runtime.sendMessage({ type: "prompta:baseUrl" }, (r) => {
    if (r?.baseUrl) baseUrl = r.baseUrl;
  });

  // ── Capture de la page ────────────────────────────────────────────────────
  function readableText() {
    try {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll("script,style,noscript,svg,nav,footer,aside,header,iframe").forEach((n) => n.remove());
      return (clone.innerText || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, MAX_CONTENT);
    } catch {
      return "";
    }
  }

  function harvestLinks() {
    const seen = new Set();
    const links = [];
    for (const a of document.querySelectorAll("a[href]")) {
      if (links.length >= MAX_LINKS) break;
      try {
        const href = new URL(a.getAttribute("href"), location.href).toString();
        if (!/^https?:/.test(href) || href === location.href || seen.has(href)) continue;
        seen.add(href);
        const label = (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70);
        links.push(label ? `${label} → ${href}` : href);
      } catch {
        /* href invalide */
      }
    }
    return links;
  }

  function capturePage(allowExplore) {
    const isPdf = document.contentType === "application/pdf";
    return {
      url: location.href,
      title: document.title || "",
      selection: String(window.getSelection() || "").trim().slice(0, 4000) || undefined,
      content: isPdf ? undefined : readableText(),
      links: allowExplore && !isPdf ? harvestLinks() : undefined,
      isPdf,
    };
  }

  // ── UI (Shadow DOM) ──────────────────────────────────────────────────────
  const host = document.createElement("div");
  host.id = "prompta-everywhere-host";
  host.style.cssText = "all:initial; position:fixed; z-index:2147483647; bottom:0; right:0;";
  const root = host.attachShadow({ mode: "closed" });
  (document.documentElement || document.body).appendChild(host);

  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
      .fab {
        position: fixed; bottom: 22px; right: 22px; width: 46px; height: 46px;
        border-radius: 50%; background: linear-gradient(135deg,#7c3aed,#4f46e5);
        color: #fff; font-size: 21px; font-weight: 700; border: none; cursor: pointer;
        box-shadow: 0 4px 14px rgba(79,70,229,.45); display: flex; align-items: center; justify-content: center;
      }
      .fab:hover { transform: scale(1.06); }
      .panel {
        position: fixed; bottom: 80px; right: 22px; width: 400px; max-width: calc(100vw - 44px);
        background: #111827; color: #e5e7eb; border-radius: 14px; padding: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,.5); display: none; flex-direction: column; gap: 10px;
        border: 1px solid #374151;
      }
      .panel.open { display: flex; }
      .row { display: flex; align-items: center; gap: 8px; }
      .title { font-weight: 700; font-size: 14px; flex: 1; color: #fff; }
      .dot-btn { background: none; border: 1px solid #4b5563; color: #9ca3af; border-radius: 8px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
      textarea {
        width: 100%; min-height: 74px; resize: vertical; border-radius: 10px; border: 1px solid #4b5563;
        background: #1f2937; color: #f9fafb; padding: 10px; font-size: 13px; outline: none;
      }
      textarea:focus { border-color: #7c3aed; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; color: #9ca3af; }
      .chip { background: #1f2937; border: 1px solid #374151; border-radius: 999px; padding: 2px 9px; }
      label.opt { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #d1d5db; cursor: pointer; }
      .send {
        background: linear-gradient(135deg,#7c3aed,#4f46e5); color: #fff; border: none; border-radius: 10px;
        padding: 9px 14px; font-size: 13px; font-weight: 600; cursor: pointer; width: 100%;
      }
      .send:disabled { opacity: .5; cursor: default; }
      .status { font-size: 12px; line-height: 1.5; max-height: 260px; overflow-y: auto; }
      .step { display: flex; gap: 7px; align-items: baseline; padding: 2px 0; }
      .step .ic { width: 14px; text-align: center; }
      .warn { color: #fbbf24; font-size: 12px; }
      .err { color: #f87171; font-size: 12px; white-space: pre-wrap; }
      .ok { color: #34d399; }
      a { color: #a78bfa; text-decoration: none; }
      .conns { display: none; flex-wrap: wrap; gap: 6px; font-size: 11px; }
      .conns.open { display: flex; }
      .conn { display: flex; align-items: center; gap: 4px; background: #1f2937; border-radius: 999px; padding: 2px 8px; }
      .led { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
      .led.on { background: #34d399; } .led.off { background: #f87171; }
    </style>
    <button class="fab" title="Prompta (Alt+P)">P</button>
    <div class="panel">
      <div class="row">
        <span class="title">Prompta — mission instantanée</span>
        <button class="dot-btn" data-role="conns-toggle">connexions</button>
        <button class="dot-btn" data-role="close">✕</button>
      </div>
      <div class="conns" data-role="conns"></div>
      <textarea placeholder="Ex. : Résume leur produit dans un Google Sheets déposé sur mon Drive, puis envoie-moi le lien par email."></textarea>
      <div class="chips" data-role="chips"></div>
      <label class="opt"><input type="checkbox" checked data-role="explore"> Autoriser l'exploration du site (suivre les liens utiles)</label>
      <button class="send">Lancer l'agent</button>
      <div class="status" data-role="status"></div>
    </div>
  `;

  const fab = root.querySelector(".fab");
  const panel = root.querySelector(".panel");
  const textarea = root.querySelector("textarea");
  const sendBtn = root.querySelector(".send");
  const statusBox = root.querySelector('[data-role="status"]');
  const chipsBox = root.querySelector('[data-role="chips"]');
  const connsBox = root.querySelector('[data-role="conns"]');
  const exploreCheck = root.querySelector('[data-role="explore"]');

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function refreshChips() {
    const sel = String(window.getSelection() || "").trim();
    const isPdf = document.contentType === "application/pdf";
    chipsBox.innerHTML =
      `<span class="chip">📄 ${esc((document.title || location.hostname).slice(0, 40))}</span>` +
      (isPdf ? `<span class="chip">PDF</span>` : "") +
      (sel ? `<span class="chip">✂️ sélection (${sel.length} car.)</span>` : "");
  }

  function togglePanel(force) {
    panelOpen = force !== undefined ? force : !panelOpen;
    panel.classList.toggle("open", panelOpen);
    if (panelOpen) {
      refreshChips();
      textarea.focus();
    }
  }

  fab.addEventListener("click", () => togglePanel());
  root.querySelector('[data-role="close"]').addEventListener("click", () => togglePanel(false));
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendBtn.click();
    e.stopPropagation();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "prompta:toggle") togglePanel(msg.withSelection ? true : undefined);
  });

  // ── Pastilles connexions ─────────────────────────────────────────────────
  root.querySelector('[data-role="conns-toggle"]').addEventListener("click", () => {
    const open = connsBox.classList.toggle("open");
    if (!open) return;
    connsBox.innerHTML = `<span style="color:#9ca3af">chargement…</span>`;
    chrome.runtime.sendMessage({ type: "prompta:connections" }, (r) => {
      if (!r?.ok) {
        connsBox.innerHTML = `<span class="warn">${r?.status === 401 ? "Connectez-vous à Prompta dans un onglet." : "Connexions inaccessibles."}</span>`;
        return;
      }
      const seen = new Set();
      connsBox.innerHTML = (r.body.connections || [])
        .filter((c) => {
          const k = c.connectorId.replace(/[^a-z0-9]/g, "");
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .map((c) => `<span class="conn"><span class="led ${c.usable ? "on" : "off"}"></span>${esc(c.connectorId)}</span>`)
        .join("") || `<span class="warn">Aucune app connectée.</span>`;
    });
  });

  // ── Lancement + suivi live ───────────────────────────────────────────────
  function renderRun(run, planned) {
    const done = run.steps_completed ?? 0;
    const steps = (planned || []).map((label, i) => {
      const ic = i < done ? "✓" : i === done && (run.status === "running" || run.status === "pending") ? "▶" : "·";
      const color = i < done ? "ok" : "";
      return `<div class="step"><span class="ic ${color}">${ic}</span><span>${esc(label)}</span></div>`;
    }).join("");
    let footer = "";
    if (run.status === "awaiting_approval") {
      footer = `<div class="warn">⏸ Validation humaine requise — <a href="${baseUrl}/dashboard/validations" target="_blank" rel="noopener">valider dans Prompta</a></div>`;
    } else if (run.status === "completed") {
      footer = `<div class="ok">✅ Mission terminée — <a href="${baseUrl}/dashboard/runs/${esc(run.id)}" target="_blank" rel="noopener">voir le dossier de mission</a></div>`;
    } else if (run.status === "failed") {
      footer = `<div class="err">✗ ${esc(run.error_message || "Échec")}</div><div><a href="${baseUrl}/dashboard/runs/${esc(run.id)}" target="_blank" rel="noopener">détails</a></div>`;
    }
    statusBox.innerHTML = steps + footer;
  }

  function stopPolling(restoreButton) {
    clearInterval(pollTimer);
    pollTimer = null;
    if (restoreButton) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Lancer l'agent";
    }
  }

  function pollRun(runId, planned) {
    stopPolling(false);
    let errorStreak = 0;
    pollTimer = setInterval(() => {
      // Panneau fermé : on cesse d'interroger le serveur (économie réseau).
      if (!panelOpen) {
        stopPolling(false);
        return;
      }
      chrome.runtime.sendMessage({ type: "prompta:status", runId }, (r) => {
        if (!r?.ok || !r.body) {
          // 5 échecs consécutifs (session expirée, serveur down) → on arrête
          // au lieu de marteler indéfiniment, avec un message actionnable.
          if (++errorStreak >= 5) {
            stopPolling(true);
            statusBox.innerHTML =
              `<div class="err">Suivi interrompu (${r?.status === 401 ? "session expirée — reconnectez-vous à Prompta" : "serveur injoignable"}). Le run continue côté serveur : <a href="${baseUrl}/dashboard/runs/${esc(runId)}" target="_blank" rel="noopener">l'ouvrir</a>.</div>`;
          }
          return;
        }
        errorStreak = 0;
        const run = r.body;
        renderRun(run, run.planned_steps?.length ? run.planned_steps : planned);
        if (["completed", "failed", "cancelled"].includes(run.status)) {
          stopPolling(true);
        }
      });
    }, 2500);
  }

  sendBtn.addEventListener("click", () => {
    const goal = textarea.value.trim();
    if (goal.length < 5) {
      statusBox.innerHTML = `<div class="warn">Décrivez la mission (5 caractères minimum).</div>`;
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = "Création de l'agent…";
    statusBox.innerHTML = `<div>🧠 Prompta conçoit l'agent à partir de tes onglets…</div>`;

    const page = capturePage(exploreCheck.checked);
    // Vue d'ensemble : demande la liste des onglets ouverts au service worker
    // (un content script n'a pas accès à chrome.tabs directement).
    chrome.runtime.sendMessage({ type: "prompta:tabs" }, (t) => {
      if (t?.ok && Array.isArray(t.tabs)) page.openTabs = t.tabs;
      const payload = { goal, page };
      chrome.runtime.sendMessage({ type: "prompta:execute", payload }, (r) => {
      if (!r?.ok) {
        sendBtn.disabled = false;
        sendBtn.textContent = "Lancer l'agent";
        // 409 : connecteurs manquants — aucun run créé, on propose de connecter.
        if (r?.status === 409 && r.body?.missingConnectors?.length) {
          statusBox.innerHTML = `<div class="warn">⚠️ À connecter d'abord : ${esc(r.body.missingConnectors.join(", "))} — <a href="${baseUrl}/dashboard/connections" target="_blank" rel="noopener">ouvrir Connexions</a>, puis relancez.</div>`;
          return;
        }
        const msg = r?.body?.message || (r?.status === 401 ? "Connectez-vous à Prompta dans un onglet, puis réessayez." : `Erreur (${r?.status || "réseau"})`);
        statusBox.innerHTML = `<div class="err">${esc(msg)}</div>`;
        return;
      }
      const { runId, title, stepsPlanned } = r.body;
      statusBox.innerHTML = `<div class="ok">🚀 « ${esc(title)} » — ${stepsPlanned} étapes</div><div>Exécution en cours…</div>`;
      sendBtn.textContent = "Agent en cours…";
      pollRun(runId, null);
      });
    });
  });
})();
