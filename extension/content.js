/**
 * Prompta partout — barre flottante d'assistant (content script).
 *
 * UN cerveau, DEUX régimes :
 *  - TAC AU TAC : la réponse arrive en streaming (SSE relayé par le service
 *    worker) — question, résumé, analyse de la page → réponse en < 1 s.
 *  - MISSION : si le modèle juge que l'ordre exige d'agir (apps, livrables,
 *    croiser des onglets), il émet la sentinelle → on capture le contenu des
 *    onglets cochés AVEC la session, puis on lance le pipeline agent complet
 *    (plan → run live → validations humaines → re-planification auto).
 *
 * Le content script répond aussi à « prompta:capture » : c'est lui qui permet
 * au service worker de lire N'IMPORTE quel onglet ouvert (même derrière login).
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
  let session = [];       // échanges instantanés terminés (cette page)
  let current = null;     // échange en cours (instant ou mission)
  let pendingClarify = null; // { goal } en attente de précisions
  let clarifyQ = null;    // questions à afficher
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
  function extractPageText(maxChars) {
    try {
      const b = document.body.cloneNode(true);
      b.querySelectorAll("script,style,noscript,svg,nav,footer,aside,header,iframe").forEach((n) => n.remove());
      return (b.innerText || "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, maxChars);
    } catch { return ""; }
  }
  function capturePage(allowExplore) {
    const isPdf = document.contentType === "application/pdf";
    const content = isPdf ? undefined : extractPageText(15000);
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
      * { box-sizing:border-box; font-family:-apple-system,"SF Pro Text","Segoe UI",Roboto,sans-serif; }
      :host { color-scheme: dark; }
      .fab { position:fixed; bottom:22px; right:22px; width:50px; height:50px; border-radius:16px;
        background:linear-gradient(135deg,#8b7cff 0%,#5b4fe0 60%,#4a3fd0 100%); color:#fff; font-size:20px; font-weight:800; border:none;
        cursor:pointer; box-shadow:0 8px 24px rgba(91,79,224,.45), inset 0 1px 0 rgba(255,255,255,.25);
        display:flex; align-items:center; justify-content:center; transition:transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s; }
      .fab:hover { transform:scale(1.08) translateY(-1px); box-shadow:0 12px 32px rgba(91,79,224,.6), inset 0 1px 0 rgba(255,255,255,.25); }
      .fab:active { transform:scale(.96); }
      .panel { position:fixed; bottom:84px; right:22px; width:408px; max-width:calc(100vw - 40px); height:580px; max-height:calc(100vh - 118px);
        background:rgba(13,17,28,.92); backdrop-filter:blur(18px) saturate(1.3); -webkit-backdrop-filter:blur(18px) saturate(1.3);
        color:#f3f5fb; border:1px solid rgba(124,108,255,.18); border-radius:20px;
        box-shadow:0 24px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.03) inset;
        display:none; flex-direction:column; overflow:hidden;
        opacity:0; transform:translateY(10px) scale(.98); transition:opacity .2s ease, transform .22s cubic-bezier(.34,1.4,.64,1); }
      .panel.open { display:flex; }
      .panel.in { opacity:1; transform:translateY(0) scale(1); }
      header { display:flex; align-items:center; gap:9px; padding:12px 14px; border-bottom:1px solid rgba(124,108,255,.12); }
      .logo { width:26px; height:26px; border-radius:8px; background:linear-gradient(135deg,#8b7cff,#5b4fe0); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; color:#fff; box-shadow:0 2px 8px rgba(91,79,224,.4); }
      header b { flex:1; font-size:13.5px; letter-spacing:.1px; }
      header .sub { color:#6b7595; font-weight:400; }
      select { appearance:none; background:rgba(30,39,64,.8); color:#dfe4f2; border:1px solid rgba(124,108,255,.18); border-radius:9px; padding:4px 9px; font-size:11px; cursor:pointer; max-width:122px; outline:none; }
      select:hover { border-color:rgba(124,108,255,.45); }
      .ico { background:none; border:1px solid rgba(124,108,255,.18); color:#aab3cc; border-radius:9px; padding:4px 8px; font-size:11px; cursor:pointer; text-decoration:none; transition:border-color .15s,color .15s; }
      .ico:hover { border-color:#8b7cff; color:#f3f5fb; }
      .feed { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; scrollbar-width:thin; scrollbar-color:#2a3350 transparent; }
      .feed::-webkit-scrollbar { width:6px; } .feed::-webkit-scrollbar-thumb { background:#2a3350; border-radius:3px; }
      .empty { margin:auto 0; text-align:center; color:#6b7595; font-size:13px; line-height:1.65; }
      .empty .big { font-size:15px; color:#aab3cc; font-weight:600; }
      .sugg { display:block; margin:7px auto 0; background:rgba(22,29,46,.9); border:1px solid rgba(124,108,255,.16); color:#aab3cc; border-radius:999px; font-size:11.5px; padding:6px 14px; cursor:pointer; transition:border-color .15s,color .15s,transform .12s; }
      .sugg:hover { border-color:#8b7cff; color:#f3f5fb; transform:translateY(-1px); }
      .req { margin-left:auto; max-width:85%; background:linear-gradient(135deg,#8b7cff,#5b4fe0); color:#fff; border-radius:16px 16px 5px 16px; padding:9px 12px; font-size:13px; cursor:pointer; text-align:left; border:none; box-shadow:0 3px 12px rgba(91,79,224,.25); line-height:1.45; }
      .req .re { opacity:0; margin-left:6px; transition:opacity .15s; } .req:hover .re { opacity:.75; }
      .res { max-width:94%; background:rgba(22,29,46,.85); border:1px solid rgba(124,108,255,.13); border-radius:16px 16px 16px 5px; padding:10px 12px; font-size:13px; line-height:1.5; }
      .ans { white-space:pre-wrap; color:#eef1fa; word-break:break-word; }
      .caret { display:inline-block; width:7px; height:14px; background:#8b7cff; border-radius:2px; vertical-align:-2px; animation:pblink .9s steps(1) infinite; }
      @keyframes pblink { 50% { opacity:0; } }
      .step { display:flex; gap:8px; font-size:12px; color:#aab3cc; padding:1.5px 0; } .step .k { width:14px; text-align:center; } .step .k.ok { color:#34d399; } .step .k.run { color:#fbbf24; }
      .think { display:flex; align-items:center; gap:8px; color:#aab3cc; font-size:12.5px; }
      .think .orb { width:14px; height:14px; border-radius:50%; background:conic-gradient(from 0deg,#8b7cff,#4a3fd0,#8b7cff); animation:pspin 1.1s linear infinite; }
      @keyframes pspin { to { transform:rotate(360deg); } }
      .meta { display:flex; align-items:center; gap:7px; margin-top:8px; font-size:11px; color:#6b7595; flex-wrap:wrap; }
      .dot { width:7px; height:7px; border-radius:50%; } .d-completed{background:#34d399;} .d-failed{background:#f87171;} .d-awaiting_approval{background:#8b7cff;} .d-running,.d-pending,.d-streaming{background:#fbbf24;}
      .dot.pulse { animation:ppulse 1.2s ease-in-out infinite; } @keyframes ppulse { 0%,100%{opacity:1;} 50%{opacity:.3;} }
      .res a { color:#a99bff; text-decoration:none; } .res a:hover { text-decoration:underline; }
      .mact { background:none; border:1px solid rgba(124,108,255,.22); color:#aab3cc; border-radius:7px; font-size:10.5px; padding:2px 8px; cursor:pointer; transition:border-color .15s,color .15s; }
      .mact:hover { border-color:#8b7cff; color:#f3f5fb; }
      .err { margin-top:6px; font-size:11.5px; color:#f87171; white-space:pre-wrap; }
      .ctx { border-top:1px solid rgba(124,108,255,.12); padding:8px 13px 0; }
      .ctxh { display:flex; align-items:center; gap:6px; font-size:11px; color:#aab3cc; cursor:pointer; user-select:none; }
      .ctxh .cv { transition:transform .15s; } .ctxh.open .cv { transform:rotate(90deg); }
      .ctxbody { display:none; } .ctxbody.open { display:block; }
      .chip { display:inline-block; background:rgba(30,39,64,.8); border:1px solid rgba(124,108,255,.15); border-radius:999px; padding:2px 9px; font-size:11px; color:#aab3cc; margin:5px 4px 0 0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .tabs { max-height:120px; overflow-y:auto; border:1px solid rgba(124,108,255,.15); border-radius:10px; margin:6px 0; }
      .trow { display:flex; align-items:center; gap:8px; padding:5px 9px; font-size:12px; border-bottom:1px solid rgba(124,108,255,.09); }
      .trow:last-child { border-bottom:none; } .trow label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#aab3cc; cursor:pointer; }
      .tact { display:flex; gap:10px; font-size:11px; padding:2px 0; } .tact button { background:none; border:none; color:#8b7cff; cursor:pointer; font-size:11px; padding:0; }
      .note { font-size:11px; color:#6b7595; margin:5px 0; } .note a { color:#a99bff; }
      .opts { display:flex; gap:14px; padding:4px 0 7px; font-size:11px; color:#aab3cc; }
      .opts label { display:flex; align-items:center; gap:5px; cursor:pointer; }
      .composer { border-top:1px solid rgba(124,108,255,.12); padding:10px 13px 12px; }
      .cbox { display:flex; align-items:flex-end; gap:8px; background:rgba(22,29,46,.9); border:1px solid rgba(124,108,255,.18); border-radius:15px; padding:8px; transition:border-color .15s, box-shadow .15s; }
      .cbox:focus-within { border-color:#8b7cff; box-shadow:0 0 0 3px rgba(139,124,255,.12); }
      textarea { flex:1; border:none; background:none; color:#f3f5fb; font-size:13px; resize:none; outline:none; max-height:110px; min-height:20px; line-height:1.45; }
      textarea::placeholder { color:#5d6786; }
      .snd { width:34px; height:34px; border-radius:11px; background:linear-gradient(135deg,#8b7cff,#5b4fe0); color:#fff; border:none; font-size:15px; cursor:pointer; flex-shrink:0; transition:transform .12s, opacity .15s; box-shadow:0 3px 10px rgba(91,79,224,.35); }
      .snd:hover:not(:disabled) { transform:scale(1.06); }
      .snd:disabled { opacity:.4; cursor:default; box-shadow:none; }
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
          <div class="note">Je lis cette page et tes onglets cochés (même connectés). Les logiciels hors navigateur ne sont pas accessibles.</div>
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
  function statusText(s) { return { completed: "terminé", failed: "échec", awaiting_approval: "à valider", running: "en cours", pending: "en file", streaming: "répond…" }[s] || s; }
  function card(it, live) {
    const isMission = it.kind === "mission" || (it.planned?.length > 0) || (it.runId && !it.instant && it.kind !== "instant");
    const hasRun = it.runId && it.runId !== "…";
    let body = "";
    if (it.answer) body += `<div class="ans">${esc(it.answer).slice(0, 12000)}${it.status === "streaming" ? '<span class="caret"></span>' : ""}</div>`;
    else if (it.status === "streaming") body += `<div class="think"><span class="orb"></span> Prompta réfléchit…</div>`;
    if (isMission && it.planned?.length) body += `<div style="margin-top:${it.answer ? "8px" : "0"}">${it.planned.map((l, i) => { const d = it.stepsCompleted ?? it.stepsDone ?? 0; const k = i < d ? "✓" : i === d && (it.status === "running" || it.status === "pending") ? "▶" : "·"; return `<div class="step"><span class="k ${i < d ? "ok" : i === d && (it.status === "running" || it.status === "pending") ? "run" : ""}">${k}</span><span>${esc(l)}</span></div>`; }).join("")}</div>`;
    else if (isMission && (it.status === "running" || it.status === "pending")) body += `<div class="think"><span class="orb"></span> Prompta conçoit l'agent…</div>`;
    let link = "";
    if (it.status === "awaiting_approval") {
      const vUrl = it.approvalId ? `${baseUrl}/dashboard/validations?focus=${esc(it.approvalId)}` : `${baseUrl}/dashboard/validations`;
      link = `<a href="${vUrl}" target="_blank" rel="noopener">⏸ valider</a>`;
    } else if (hasRun && (it.status === "completed" || it.status === "failed")) link = `<a href="${baseUrl}/dashboard/runs/${esc(it.runId)}" target="_blank" rel="noopener">dossier ↗</a>`;
    else if (live && hasRun && (it.status === "running" || it.status === "pending")) link = `<button class="mact" data-cancel="${esc(it.runId)}">■ stop</button>`;
    // « Réutiliser comme agent » : missions multi-étapes terminées.
    const multiStep = (it.stepsCompleted ?? 0) > 1 || (it.planned?.length ?? 0) > 1;
    const saveBtn = isMission && hasRun && it.status === "completed" && multiStep && !it.savedAgent
      ? `<button class="mact" data-save="${esc(it.runId)}">💾 garder comme agent</button>` : "";
    const savedNote = it.savedAgent ? `<a href="${esc(it.savedAgent)}" target="_blank" rel="noopener">agent enregistré ↗</a>` : "";
    const connectLink = it.status === "failed" && it.needsConnect ? ` <a href="${baseUrl}/dashboard/connexions" target="_blank" rel="noopener">connecter ↗</a>` : "";
    const err = it.status === "failed" && it.error ? `<div class="err">${esc(it.error).slice(0, 220)}${connectLink}</div>` : "";
    const pulse = live && !["completed", "failed", "awaiting_approval"].includes(it.status) ? " pulse" : "";
    return `<button class="req" data-reuse="${esc(it.goal)}">${esc(it.goal)}<span class="re">↺</span></button>
      <div class="res">${body}<div class="meta"><span class="dot d-${esc(it.status)}${pulse}"></span>${esc(statusText(it.status))}${it.model ? " · " + esc(it.model) : ""}${saveBtn}${savedNote}${link}</div>${err}</div>`;
  }
  let lastFeedSig = "";
  function renderFeed(force) {
    const seen = new Set(history.map((h) => (h.goal || "").slice(0, 200)));
    const localItems = session.filter((s) => !seen.has((s.goal || "").slice(0, 200)));
    const items = [...history].reverse().concat(localItems);
    const live = current && !history.some((h) => current.runId && h.runId === current.runId) ? current : null;
    // Signature : on ne reconstruit le DOM que si quelque chose a VRAIMENT changé
    // (sinon un tick de poll identique effacerait la sélection de texte de l'user).
    const sig = items.map((h) => (h.runId || h.goal) + h.status + (h.savedAgent || "")).join("|") + "#" + (live ? `${live.runId}:${live.status}:${live.stepsCompleted}:${(live.answer || "").length}:${(live.planned || []).length}` : "") + "?" + (clarifyQ ? clarifyQ.join("|") : "");
    if (!force && sig === lastFeedSig) return;
    lastFeedSig = sig;
    // Ne pas ré-ancrer en bas si l'utilisateur a scrollé vers le haut pour lire.
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
    const clarifyHtml = clarifyQ && clarifyQ.length
      ? `<div class="res" style="border-color:#8b7cff66"><div style="color:#f3f5fb;font-weight:600;margin-bottom:4px">Quelques précisions pour bien faire :</div><ul style="margin:0;padding-left:18px;color:#aab3cc">${clarifyQ.map((q) => `<li>${esc(q)}</li>`).join("")}</ul><div style="color:#6b7595;font-size:11px;margin-top:6px">Réponds ci-dessous, je m'occupe du reste.</div></div>`
      : "";
    const suggestions = ["Résume cette page en 5 points", "Compare mes onglets ouverts", "Rédige un email pro à partir de ma sélection"];
    const emptyHtml = `<div class="empty"><span class="big">Ton assistant, partout.</span><br>Réponse immédiate aux questions,<br>agent complet pour les missions sur tes apps.<br><br>${suggestions.map((s) => `<button class="sugg" data-reuse="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
    const html = items.map((it) => card(it)).join("") + (live ? card(live, true) : "") + clarifyHtml;
    feed.innerHTML = html || emptyHtml;
    feed.querySelectorAll("[data-reuse]").forEach((b) => b.addEventListener("click", () => { goalEl.value = b.dataset.reuse; goalEl.focus(); }));
    feed.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => { b.disabled = true; await send("prompta:cancel", { runId: b.dataset.cancel }); }));
    feed.querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "…";
      const r = await send("prompta:save-agent", { runId: b.dataset.save });
      if (r?.ok && r.body?.url) {
        const target = [...history, ...session, current].find((x) => x && x.runId === b.dataset.save);
        if (target) target.savedAgent = baseUrl + r.body.url;
        renderFeed(true);
      } else { b.disabled = false; b.textContent = "💾 garder comme agent"; }
    }));
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
      current.approvalId = r.body.approval_id ?? null;
      renderFeed();
      // Terminal OU en attente de validation : on cesse de poller (la validation
      // se fait dans le dashboard ; loadHistory rafraîchira à la réouverture).
      if (["completed", "failed", "cancelled", "awaiting_approval"].includes(r.body.status)) {
        stopPoll(); launching = false; sendBtn.disabled = false; loadHistory();
      }
    }, 2500);
  }

  /** Bascule mission : capture des onglets cochés (session incluse) puis pipeline agent. */
  async function launchMission(goal) {
    current = { kind: "mission", runId: "…", goal, model: modelEl.value || null, status: "pending", planned: [], stepsCompleted: 0 };
    renderFeed();
    const page = capturePage(exploreEl.checked);
    const targeted = openTabs.filter((t) => t.checked).map((t) => ({ title: t.title, url: t.url }));
    if (targeted.length) {
      // Contenu réel des onglets, lu PAR le navigateur : c'est ce qui permet de
      // croiser des pages derrière login (dashboards, CRM, mails ouverts…).
      const cap = await send("prompta:tabcontents", { urls: targeted.map((t) => t.url), maxTabs: 8, maxChars: 8000 });
      page.openTabs = (cap?.ok && Array.isArray(cap.tabs) ? cap.tabs : targeted).filter((t) => t.url !== location.href);
    }
    const r = await send("prompta:execute", { payload: { goal, page, modelId: modelEl.value || undefined } });
    // L'agent demande des précisions : on affiche les questions, pas de run.
    if (r?.ok && Array.isArray(r.body?.clarify) && r.body.clarify.length) {
      launching = false; sendBtn.disabled = false;
      pendingClarify = { goal }; clarifyQ = r.body.clarify; current = null;
      renderFeed(); goalEl.focus(); return;
    }
    if (!r?.ok) {
      launching = false; sendBtn.disabled = false;
      current.status = "failed";
      if (r?.status === 409 && r.body?.missingConnectors?.length) {
        current.error = `À connecter : ${r.body.missingConnectors.join(", ")}`;
        current.needsConnect = true;
      } else {
        current.error = r?.body?.message || (r?.status === 401 ? "Connecte-toi à Prompta." : `Erreur ${r?.status || "réseau"}`);
      }
      renderFeed(); return;
    }
    current.runId = r.body.runId; current.title = r.body.title; current.status = "running";
    renderFeed(); poll();
  }

  /** Tac au tac streamé ; bascule automatiquement en mission si le modèle le décide. */
  function launchInstant(goal, page) {
    current = { kind: "instant", goal, model: modelEl.value || null, status: "streaming", answer: "" };
    renderFeed();
    // Continuité conversationnelle : les 3 derniers échanges textuels.
    const hist = [];
    for (const it of [...history].reverse().concat(session).slice(-6)) {
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
      renderFeed(true);
    };
    port.onMessage.addListener((m) => {
      if (m?.delta) { current.answer += m.delta; renderFeed(true); }
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
    // Réponse à une demande de précisions : on recolle l'ordre initial et on
    // repart DIRECTEMENT en mission (c'est une mission qui a demandé ça).
    if (pendingClarify) {
      goal = `${pendingClarify.goal}\n\nPrécisions de l'utilisateur : ${goal}`;
      pendingClarify = null; clarifyQ = null;
      launchMission(goal); return;
    }
    const page = capturePage(false);
    delete page.links; // le tac au tac n'explore pas — la mission le fera
    launchInstant(goal, page);
  }

  // ── Interactions ───────────────────────────────────────────────────────
  function toggle(force) {
    panelOpen = force !== undefined ? force : !panelOpen;
    panel.classList.toggle("open", panelOpen);
    requestAnimationFrame(() => panel.classList.toggle("in", panelOpen));
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

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "prompta:toggle") { toggle(true); return; }
    // Le service worker lit CET onglet (croisement d'onglets avec session).
    if (msg?.type === "prompta:capture") {
      sendResponse({ content: extractPageText(msg.maxChars || 8000), title: document.title || "", url: location.href });
    }
  });

  // ── Boot ────────────────────────────────────────────────────────────────
  (async () => {
    await Promise.all([loadModels(), loadHistory(), loadTabs()]);
    renderFeed();
  })();
})();
