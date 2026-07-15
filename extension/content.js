/**
 * Prompta partout — barre flottante d'assistant (content script).
 *
 * Panneau CHAT sur toutes les pages : fil de conversation + historique
 * cliquable, sélecteur de modèle, panneau « ce que je vois » avec la page
 * active ET la liste des ONGLETS ouverts ciblables (la surface omnisciente :
 * elle voit tout ce qui est ouvert dans le navigateur). Réponse simple inline,
 * mission agent en live, validations humaines signalées.
 *
 * Shadow DOM (zéro fuite CSS). Tout le réseau passe par le service worker.
 */

(() => {
  if (window.__promptaEverywhere) return;
  window.__promptaEverywhere = true;

  let baseUrl = "https://prompta-sjtf.onrender.com";
  let panelOpen = false;
  let pollTimer = null;
  let launching = false;
  let openTabs = [];      // [{title,url,checked}]
  let history = [];       // items serveur
  let current = null;     // run en cours
  const send = (type, extra) => new Promise((res) => chrome.runtime.sendMessage({ type, ...extra }, (r) => res(r || { ok: false, status: 0, body: {} })));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function extractAnswer(o) {
    if (!o || typeof o !== "object") return null;
    if (typeof o.reponse === "string") return o.reponse;
    if (typeof o.result === "string") return o.result;
    const v = Object.entries(o).filter(([k, x]) => !k.startsWith("__") && !k.endsWith("_output") && typeof x === "string");
    return v.length ? v[v.length - 1][1] : null;
  }

  // ── Capture ──────────────────────────────────────────────────────────────
  function capturePage(allowExplore) {
    const isPdf = document.contentType === "application/pdf";
    let content = "";
    try {
      const b = document.body.cloneNode(true);
      b.querySelectorAll("script,style,noscript,svg,nav,footer,aside,header,iframe").forEach((n) => n.remove());
      content = isPdf ? undefined : (b.innerText || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 15000);
    } catch { /* */ }
    let links;
    if (allowExplore && !isPdf) {
      const seen = new Set(); links = [];
      for (const a of document.querySelectorAll("a[href]")) {
        if (links.length >= 40) break;
        try {
          const h = new URL(a.getAttribute("href"), location.href).toString();
          if (!/^https?:/.test(h) || h === location.href || seen.has(h)) continue;
          seen.add(h);
          const l = (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70);
          links.push(l ? `${l} → ${h}` : h);
        } catch { /* */ }
      }
    }
    return { url: location.href, title: document.title || "", selection: String(window.getSelection() || "").trim().slice(0, 4000) || undefined, content, links, isPdf };
  }
  async function loadTabs() {
    const r = await send("prompta:tabs");
    openTabs = (r?.ok && Array.isArray(r.tabs) ? r.tabs : []).map((t) => ({ title: t.title, url: t.url, checked: true }));
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  const host = document.createElement("div");
  host.id = "prompta-everywhere-host";
  host.style.cssText = "all:initial; position:fixed; z-index:2147483647; bottom:0; right:0;";
  const root = host.attachShadow({ mode: "closed" });
  (document.documentElement || document.body).appendChild(host);
  root.innerHTML = `
    <style>
      * { box-sizing:border-box; font-family:-apple-system,"Segoe UI",Roboto,sans-serif; }
      .fab { position:fixed; bottom:22px; right:22px; width:48px; height:48px; border-radius:50%;
        background:linear-gradient(135deg,#7c6cff,#5b4fe0); color:#fff; font-size:20px; font-weight:800; border:none;
        cursor:pointer; box-shadow:0 6px 18px rgba(91,79,224,.5); display:flex; align-items:center; justify-content:center; }
      .fab:hover { transform:scale(1.06); }
      .panel { position:fixed; bottom:80px; right:22px; width:400px; max-width:calc(100vw - 40px); height:560px; max-height:calc(100vh - 110px);
        background:#0f1420; color:#f3f5fb; border:1px solid #2a3350; border-radius:16px; box-shadow:0 16px 50px rgba(0,0,0,.55);
        display:none; flex-direction:column; overflow:hidden; }
      .panel.open { display:flex; }
      header { display:flex; align-items:center; gap:8px; padding:11px 13px; border-bottom:1px solid #2a3350; }
      .logo { width:24px; height:24px; border-radius:7px; background:linear-gradient(135deg,#7c6cff,#5b4fe0); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; color:#fff; }
      header b { flex:1; font-size:13px; }
      header .sub { color:#6b7595; font-weight:400; }
      select { appearance:none; background:#1e2740; color:#f3f5fb; border:1px solid #2a3350; border-radius:8px; padding:4px 8px; font-size:11px; cursor:pointer; max-width:120px; }
      .ico { background:none; border:1px solid #2a3350; color:#aab3cc; border-radius:8px; padding:4px 7px; font-size:11px; cursor:pointer; text-decoration:none; }
      .ico:hover { border-color:#7c6cff; color:#f3f5fb; }
      .feed { flex:1; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
      .empty { margin:auto 0; text-align:center; color:#6b7595; font-size:13px; line-height:1.6; }
      .req { margin-left:auto; max-width:85%; background:linear-gradient(135deg,#7c6cff,#5b4fe0); color:#fff; border-radius:14px 14px 4px 14px; padding:8px 11px; font-size:13px; cursor:pointer; text-align:left; border:none; }
      .req .re { opacity:0; margin-left:6px; } .req:hover .re { opacity:.7; }
      .res { max-width:92%; background:#161d2e; border:1px solid #2a3350; border-radius:14px 14px 14px 4px; padding:9px 11px; font-size:13px; }
      .ans { white-space:pre-wrap; color:#f3f5fb; }
      .step { display:flex; gap:7px; font-size:12px; color:#aab3cc; } .step .k { width:13px; text-align:center; } .step .k.ok { color:#34d399; }
      .meta { display:flex; align-items:center; gap:6px; margin-top:7px; font-size:11px; color:#6b7595; }
      .dot { width:7px; height:7px; border-radius:50%; } .d-completed{background:#34d399;} .d-failed{background:#f87171;} .d-awaiting_approval{background:#7c6cff;} .d-running,.d-pending{background:#fbbf24;}
      .dot.pulse { animation:ppulse 1.2s ease-in-out infinite; } @keyframes ppulse { 0%,100%{opacity:1;} 50%{opacity:.35;} }
      .res a { color:#a99bff; text-decoration:none; margin-left:auto; } .res a:hover { text-decoration:underline; }
      .err { margin-top:5px; font-size:11px; color:#f87171; }
      .ctx { border-top:1px solid #2a3350; padding:7px 12px 0; }
      .ctxh { display:flex; align-items:center; gap:6px; font-size:11px; color:#aab3cc; cursor:pointer; }
      .ctxh .cv { transition:transform .15s; } .ctxh.open .cv { transform:rotate(90deg); }
      .ctxbody { display:none; } .ctxbody.open { display:block; }
      .chip { display:inline-block; background:#1e2740; border:1px solid #2a3350; border-radius:999px; padding:2px 8px; font-size:11px; color:#aab3cc; margin:4px 4px 0 0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tabs { max-height:120px; overflow-y:auto; border:1px solid #2a3350; border-radius:8px; margin:6px 0; }
      .trow { display:flex; align-items:center; gap:8px; padding:5px 8px; font-size:12px; border-bottom:1px solid #2a3350; }
      .trow:last-child { border-bottom:none; } .trow label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#aab3cc; cursor:pointer; }
      .tact { display:flex; gap:10px; font-size:11px; padding:2px 0; } .tact button { background:none; border:none; color:#7c6cff; cursor:pointer; font-size:11px; padding:0; }
      .note { font-size:11px; color:#6b7595; margin:4px 0; } .note a { color:#a99bff; }
      .opts { display:flex; gap:14px; padding:4px 0 6px; font-size:11px; color:#aab3cc; }
      .opts label { display:flex; align-items:center; gap:5px; cursor:pointer; }
      .composer { border-top:1px solid #2a3350; padding:9px 12px; }
      .cbox { display:flex; align-items:flex-end; gap:8px; background:#161d2e; border:1px solid #2a3350; border-radius:14px; padding:7px; }
      .cbox:focus-within { border-color:#7c6cff; }
      textarea { flex:1; border:none; background:none; color:#f3f5fb; font-size:13px; resize:none; outline:none; max-height:110px; min-height:20px; line-height:1.4; }
      .snd { width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg,#7c6cff,#5b4fe0); color:#fff; border:none; font-size:15px; cursor:pointer; flex-shrink:0; }
      .snd:disabled { opacity:.45; cursor:default; }
    </style>
    <button class="fab" title="Prompta (Alt+P)">P</button>
    <div class="panel">
      <header>
        <span class="logo">P</span>
        <b>Prompta <span class="sub">· partout</span></b>
        <select data-r="model"><option>…</option></select>
        <a class="ico" data-r="conns" target="_blank" title="Apps connectées">🔌</a>
        <button class="ico" data-r="close">✕</button>
      </header>
      <div class="feed" data-r="feed"></div>
      <div class="ctx">
        <div class="ctxh" data-r="ctxh"><span class="cv">▸</span> 👁 <span data-r="ctxsum">Ce que je vois</span></div>
        <div class="ctxbody" data-r="ctxbody">
          <div data-r="chips"></div>
          <div class="tact" data-r="tact" style="display:none"><button data-r="tall">tout cocher</button><button data-r="tnone">tout décocher</button></div>
          <div class="tabs" data-r="tabs" style="display:none"></div>
          <div class="note">Je vois cette page + tes onglets ouverts. Les logiciels/PDF hors navigateur ne sont pas accessibles.</div>
          <div class="opts">
            <label><input type="checkbox" data-r="alltabs" checked> voir mes onglets</label>
            <label><input type="checkbox" data-r="explore" checked> explorer les liens</label>
          </div>
        </div>
      </div>
      <div class="composer">
        <div class="cbox">
          <textarea data-r="goal" rows="1" placeholder="Demande simple ou grosse mission…  (Entrée)"></textarea>
          <button class="snd" data-r="send">↑</button>
        </div>
      </div>
    </div>`;

  const $ = (r) => root.querySelector(`[data-r="${r}"]`);
  const fab = root.querySelector(".fab");
  const panel = root.querySelector(".panel");
  const feed = $("feed"), goalEl = $("goal"), sendBtn = $("send"), modelEl = $("model");
  const ctxh = $("ctxh"), ctxbody = $("ctxbody"), ctxsum = $("ctxsum"), chips = $("chips"), tabsBox = $("tabs"), tact = $("tact");
  const alltabsEl = $("alltabs"), exploreEl = $("explore");

  send("prompta:baseUrl").then((r) => { if (r?.baseUrl) { baseUrl = r.baseUrl; $("conns").href = baseUrl + "/dashboard/connexions"; } });

  // ── Rendu ──────────────────────────────────────────────────────────────
  function statusText(s) { return { completed: "terminé", failed: "échec", awaiting_approval: "à valider", running: "en cours", pending: "en file" }[s] || s; }
  function card(it, live) {
    const isAgent = (it.planned?.length > 0) || (!it.answer && it.status !== "completed");
    let body = it.answer ? `<div class="ans">${esc(it.answer).slice(0, 8000)}</div>` : "";
    if (isAgent && it.planned?.length) body += `<div>${it.planned.map((l, i) => { const d = it.stepsCompleted ?? it.stepsDone ?? 0; const k = i < d ? "✓" : i === d && (it.status === "running" || it.status === "pending") ? "▶" : "·"; return `<div class="step"><span class="k ${i < d ? "ok" : ""}">${k}</span><span>${esc(l)}</span></div>`; }).join("")}</div>`;
    else if (isAgent && (it.status === "running" || it.status === "pending")) body += `<div style="color:#aab3cc">🧠 Prompta conçoit l'agent…</div>`;
    let link = "";
    if (it.status === "awaiting_approval") link = `<a href="${baseUrl}/dashboard/validations" target="_blank" rel="noopener">valider</a>`;
    else if (it.runId && it.runId !== "…" && (it.status === "completed" || it.status === "failed")) link = `<a href="${baseUrl}/dashboard/runs/${esc(it.runId)}" target="_blank" rel="noopener">dossier ↗</a>`;
    const err = it.status === "failed" && it.error ? `<div class="err">${esc(it.error).slice(0, 140)}</div>` : "";
    const pulse = live && !["completed", "failed", "awaiting_approval"].includes(it.status) ? " pulse" : "";
    return `<button class="req" data-reuse="${esc(it.goal)}">${esc(it.goal)}<span class="re">↺</span></button>
      <div class="res">${body}<div class="meta"><span class="dot d-${esc(it.status)}${pulse}"></span>${esc(statusText(it.status))}${it.model ? " · " + esc(it.model) : ""}${link}</div>${err}</div>`;
  }
  let lastFeedSig = "";
  function renderFeed() {
    const items = [...history].reverse();
    const live = current && !history.some((h) => h.runId === current.runId) ? current : null;
    // Signature : on ne reconstruit le DOM que si quelque chose a VRAIMENT changé
    // (sinon un tick de poll identique effacerait la sélection de texte de l'user).
    const sig = items.map((h) => h.runId + h.status).join("|") + "#" + (live ? `${live.runId}:${live.status}:${live.stepsCompleted}:${(live.answer || "").length}:${(live.planned || []).length}` : "");
    if (sig === lastFeedSig) return;
    lastFeedSig = sig;
    // Ne pas ré-ancrer en bas si l'utilisateur a scrollé vers le haut pour lire.
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
    const html = items.map((it) => card(it)).join("") + (live ? card(live, true) : "");
    feed.innerHTML = html || `<div class="empty">Ton assistant du quotidien.<br>Pose une question, ou confie-lui une mission<br>sur tes onglets et tes apps.</div>`;
    feed.querySelectorAll("[data-reuse]").forEach((b) => b.addEventListener("click", () => { goalEl.value = b.dataset.reuse; goalEl.focus(); }));
    if (nearBottom) feed.scrollTop = feed.scrollHeight;
  }
  function renderCtx() {
    const checked = openTabs.filter((t) => t.checked).length;
    ctxsum.textContent = `Ce que je vois${openTabs.length ? ` · cette page + ${checked}/${openTabs.length} onglets` : " · cette page"}`;
    chips.innerHTML = `<span class="chip">📄 ${esc((document.title || location.hostname).slice(0, 40))}</span>` +
      (document.contentType === "application/pdf" ? `<span class="chip">PDF</span>` : "") +
      (String(window.getSelection() || "").trim() ? `<span class="chip">✂️ sélection</span>` : "");
    tact.style.display = openTabs.length ? "flex" : "none";
    tabsBox.style.display = openTabs.length ? "block" : "none";
    tabsBox.innerHTML = openTabs.map((t, i) => `<div class="trow"><input type="checkbox" data-i="${i}" ${t.checked ? "checked" : ""}><label title="${esc(t.url)}">${esc(t.title || t.url)}</label></div>`).join("");
    tabsBox.querySelectorAll("input").forEach((cb) => cb.addEventListener("change", (e) => { openTabs[+e.target.dataset.i].checked = e.target.checked; renderCtx(); }));
  }

  async function loadModels() {
    const r = await send("prompta:models");
    const { promptaModel } = await chrome.storage.sync.get("promptaModel");
    const ms = r?.ok && Array.isArray(r.body.models) ? r.body.models : [];
    const firstUsable = ms.find((m) => m.usable);
    modelEl.innerHTML = (firstUsable ? "" : `<option value="">défaut</option>`) + ms.map((m) => `<option value="${esc(m.id)}" ${m.usable ? "" : "disabled"}>${esc(m.label)}${m.usable ? "" : " (clé)"}</option>`).join("");
    modelEl.value = ms.find((m) => m.id === promptaModel && m.usable) ? promptaModel : (firstUsable?.id ?? "");
  }
  async function loadHistory() { const r = await send("prompta:history"); if (r?.ok && Array.isArray(r.body.items)) { history = r.body.items; renderFeed(); } }

  // ── Exécution ────────────────────────────────────────────────────────────
  function stopPoll() { clearInterval(pollTimer); pollTimer = null; }
  function poll() {
    stopPoll(); let errs = 0;
    pollTimer = setInterval(async () => {
      // Panneau fermé : on ARRÊTE le poll (il reprendra à la réouverture si le
      // run est encore en vol) — évite un timer qui tourne indéfiniment.
      if (!panelOpen) { stopPoll(); return; }
      const r = await send("prompta:status", { runId: current.runId });
      if (!r?.ok || !r.body) { if (++errs >= 5) { stopPoll(); current.status = "failed"; current.error = "suivi interrompu"; renderFeed(); launching = false; sendBtn.disabled = false; } return; }
      errs = 0;
      current.status = r.body.status; current.stepsCompleted = r.body.steps_completed ?? 0;
      current.planned = r.body.planned_steps?.length ? r.body.planned_steps : current.planned;
      current.error = r.body.error_message; current.answer = extractAnswer(r.body.output);
      renderFeed();
      // Terminal OU en attente de validation : on cesse de poller (la validation
      // se fait dans le dashboard ; loadHistory rafraîchira à la réouverture).
      if (["completed", "failed", "cancelled", "awaiting_approval"].includes(r.body.status)) {
        stopPoll(); launching = false; sendBtn.disabled = false; loadHistory();
      }
    }, 2500);
  }
  async function launch() {
    if (launching) return;
    const goal = goalEl.value.trim();
    if (goal.length < 3) return;
    launching = true; sendBtn.disabled = true;
    const page = capturePage(exploreEl.checked);
    const targeted = openTabs.filter((t) => t.checked).map((t) => ({ title: t.title, url: t.url }));
    if (targeted.length) page.openTabs = targeted;
    current = { runId: "…", goal, model: modelEl.value || null, status: "pending", planned: [], stepsCompleted: 0 };
    renderFeed(); goalEl.value = ""; goalEl.style.height = "auto";
    const r = await send("prompta:execute", { payload: { goal, page, modelId: modelEl.value || undefined } });
    if (!r?.ok) {
      launching = false; sendBtn.disabled = false;
      current.status = "failed";
      current.error = r?.status === 409 && r.body?.missingConnectors?.length ? `À connecter : ${r.body.missingConnectors.join(", ")}` : (r?.body?.message || (r?.status === 401 ? "Connecte-toi à Prompta." : `Erreur ${r?.status || "réseau"}`));
      renderFeed(); return;
    }
    current.runId = r.body.runId; current.title = r.body.title; current.status = "running";
    renderFeed(); poll();
  }

  // ── Interactions ───────────────────────────────────────────────────────
  function toggle(force) {
    panelOpen = force !== undefined ? force : !panelOpen;
    panel.classList.toggle("open", panelOpen);
    if (panelOpen) {
      renderCtx();
      goalEl.focus();
      // Reprend le suivi si un run est encore en vol (poll arrêté à la fermeture).
      if (current && ["running", "pending"].includes(current.status) && !pollTimer) poll();
    }
  }
  fab.addEventListener("click", () => toggle());
  $("close").addEventListener("click", () => toggle(false));
  sendBtn.addEventListener("click", launch);
  goalEl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); launch(); } });
  goalEl.addEventListener("input", () => { goalEl.style.height = "auto"; goalEl.style.height = Math.min(110, goalEl.scrollHeight) + "px"; });
  modelEl.addEventListener("change", () => chrome.storage.sync.set({ promptaModel: modelEl.value }));
  ctxh.addEventListener("click", () => { const o = ctxh.classList.toggle("open"); ctxbody.classList.toggle("open", o); });
  $("tall").addEventListener("click", () => { openTabs.forEach((t) => (t.checked = true)); renderCtx(); });
  $("tnone").addEventListener("click", () => { openTabs.forEach((t) => (t.checked = false)); renderCtx(); });
  alltabsEl.addEventListener("change", async () => { if (alltabsEl.checked) await loadTabs(); else openTabs = []; renderCtx(); });

  chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === "prompta:toggle") toggle(true); });

  // ── Boot ────────────────────────────────────────────────────────────────
  (async () => {
    await Promise.all([loadModels(), loadHistory(), loadTabs()]);
    renderFeed();
  })();
})();
